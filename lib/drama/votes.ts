import "server-only";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { buttonMessage, replyToComment, type IgCreds } from "@/lib/instagram";
import { tellAdmin } from "@/lib/telegram";
import { syncPosted } from "@/lib/drama/episodes";

/**
 * A comment on an Alux Micro Drama episode is a vote. Called by the Instagram
 * webhook for every comment on our media, BEFORE the shop keywords, and returns
 * true only when the comment was a vote on a drama post (so SPEAK or WAIT are
 * never read as shop words there). Anything else returns false and the webhook
 * carries on exactly as it always has.
 *
 * Rules (tools/drama/ENGINE.md §4): the comment's first word must be one of the
 * episode's two words; one vote per person per episode; the first word to reach
 * the story's min_votes distinct voters wins and closes the vote. Every voter
 * gets one private reply. The owner hears the result on Telegram.
 */

type Hit = {
  episode_id: string; n: number; status: string; decided_word: string | null; content: { title: string; choice: { options: { word: string; label: string }[] } };
  story_id: string; slug: string; title: string; min_votes: number;
};

const GRAPH = "https://graph.instagram.com/v21.0";
const storyUrl = (slug: string) => `${SITE_URL.replace(/\/$/, "")}/d/drama/${slug}`;

async function episodeForMedia(mediaId: string): Promise<Hit | null> {
  const find = () => sql<Hit[]>`
    SELECT e.id AS episode_id, e.n, e.status, e.decided_word, e.content, s.id AS story_id, s.slug, s.title, s.min_votes
    FROM drama_episodes e JOIN drama_stories s ON s.id = e.story_id
    WHERE e.ig_media_id = ${mediaId}`;
  let [hit] = await find();
  if (!hit) {
    // The publisher has posted it but no page has synced yet: is it ours at all?
    const [q] = await sql<{ local_id: string }[]>`
      SELECT local_id FROM scheduled_carousels WHERE ig_media_id = ${mediaId} AND local_id LIKE 'drama-%' LIMIT 1`;
    if (!q) return null;
    await syncPosted();
    [hit] = await find();
  }
  return hit ?? null;
}

/** A comment's first real word, upper case, @handles ignored. */
const firstWord = (text: string) => text.replace(/@[A-Za-z0-9._]+/g, " ").trim().split(/[\s,.!?:;]+/)[0]?.toUpperCase() ?? "";

/** The vote word, if the comment is one. */
function wordOf(text: string, options: string[]): string | null {
  const first = firstWord(text);
  return options.includes(first) ? first : null;
}

/**
 * Words that ask for the game link instead of voting. A link in an Instagram
 * caption is never tappable, so the caption says "comment PLAY" and the link
 * arrives in the DMs as a button.
 */
const LINK_WORDS = ["PLAY", "GAME", "LINK"];

/** One private reply to the comment, with the story link as a button when Instagram allows it. */
async function answer(creds: IgCreds, commentId: string, text: string, url: string, title = "Open the story") {
  const r = await fetch(`${GRAPH}/${creds.accountId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: buttonMessage(text, [{ title, url }]), access_token: creds.token }),
  }).then((x) => x.json()).catch((e) => ({ error: { message: String(e) } }));
  if (!r?.error) return;
  console.warn("[drama vote] button reply refused, sending text:", JSON.stringify(r.error).slice(0, 200));
  const t = await replyToComment(creds, commentId, `${text}\n${url}`);
  if (!t.ok) console.warn("[drama vote] text reply failed too:", t.error.slice(0, 200));
}

export async function handleDramaComment(
  c: { mediaId: string; commentId: string; text: string; fromId?: string; fromUsername?: string },
  creds: IgCreds | null,
): Promise<boolean> {
  if (!c.mediaId || !c.fromId) return false;
  const hit = await episodeForMedia(c.mediaId);
  if (!hit) return false;
  const options = hit.content.choice.options.map((o) => o.word);
  const word = wordOf(c.text, options);
  const voter = `ig:${c.fromId}`;
  const who = c.fromUsername ? `@${c.fromUsername}` : voter;
  const url = storyUrl(hit.slug);
  if (!word) {
    if (!LINK_WORDS.includes(firstWord(c.text))) return false; // a comment, not a vote — leave it to everything else
    console.log(`[drama vote] ${who} asked for the game link on ${hit.slug} ep ${hit.n}`);
    if (creds) {
      const [a, b] = hit.content.choice.options;
      await answer(creds, c.commentId,
        `Here's the game: every story, the roles you can play, and how to vote.\nTo vote on Episode ${hit.n} of ${hit.title}, comment ${a.word} or ${b.word} on the post.`,
        url, "Open the game");
    }
    return true;
  }

  // Count and decide in one transaction, with the episode row locked, so two
  // votes arriving together cannot both "win" or both miss the threshold.
  const out = await sql.begin(async (tx) => {
    const [ep] = await tx<{ status: string; decided_word: string | null }[]>`
      SELECT status, decided_word FROM drama_episodes WHERE id = ${hit.episode_id} FOR UPDATE`;
    if (ep.decided_word) return { kind: "closed" as const, winner: ep.decided_word };
    const ins = await tx`
      INSERT INTO drama_votes (episode_id, word, voter, source) VALUES (${hit.episode_id}, ${word}, ${voter}, 'instagram')
      ON CONFLICT (episode_id, voter) DO NOTHING RETURNING id`;
    if (!ins.length) {
      const [mine] = await tx<{ word: string }[]>`SELECT word FROM drama_votes WHERE episode_id = ${hit.episode_id} AND voter = ${voter}`;
      return { kind: "again" as const, mine: mine?.word ?? word };
    }
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM drama_votes WHERE episode_id = ${hit.episode_id} AND word = ${word}`;
    if (n >= hit.min_votes) {
      await tx`UPDATE drama_episodes SET decided_word = ${word}, decided_at = now(), status = 'closed', updated_at = now() WHERE id = ${hit.episode_id}`;
      return { kind: "decided" as const, count: n };
    }
    return { kind: "counted" as const, count: n };
  });

  console.log(`[drama vote] ${who} → ${word} on ${hit.slug} ep ${hit.n}: ${out.kind}`);
  if (creds) {
    const label = hit.content.choice.options.find((o) => o.word === word)?.label ?? "";
    if (out.kind === "counted") {
      const left = hit.min_votes - out.count;
      await answer(creds, c.commentId,
        `Your vote is in: ${word} — ${label.toLowerCase()}.\n${left} more ${left === 1 ? "vote decides" : "votes decide"} it. Watch Episode ${hit.n + 1} take shape, and play a role in the next story:`, url);
    } else if (out.kind === "decided") {
      await answer(creds, c.commentId,
        `Your vote decided it. ${word} wins — Episode ${hit.n + 1} of ${hit.title} is being written now. Want to be in the next one?`, url, "Play a role");
    } else if (out.kind === "closed") {
      await answer(creds, c.commentId, `This vote has closed: ${out.winner} won. Episode ${hit.n + 1} is on its way.`, url);
    } else {
      await answer(creds, c.commentId, `You've already voted ${out.mine} on this episode — one vote each. See how it is going:`, url);
    }
  }
  if (out.kind === "decided") {
    await tellAdmin(`🎬 <b>${hit.title}</b> — Episode ${hit.n} decided: <b>${word}</b> (${out.count} votes, last by ${who}).\nEpisode ${hit.n + 1} follows that road. Open /admin/drama to make it.`).catch(() => false);
  }
  return true;
}
