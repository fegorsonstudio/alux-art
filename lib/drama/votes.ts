import "server-only";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { buttonMessage, replyToComment, type IgCreds } from "@/lib/instagram";
import { syncPosted } from "@/lib/drama/episodes";
import { closesLabel, tally, voteClosesAt } from "@/lib/drama/vote-rules";

/**
 * A comment on an Alux Micro Drama episode is a vote. Called by the Instagram
 * webhook for every comment on our media, BEFORE the shop keywords, and returns
 * true only when the comment was a vote on a drama post (so SPEAK or WAIT are
 * never read as shop words there). Anything else returns false and the webhook
 * carries on exactly as it always has.
 *
 * Rules (tools/drama/ENGINE.md §4, lib/drama/vote-rules.ts): the comment's first
 * word must be one of the episode's two words; one vote per person per episode;
 * voting stays open until 4 p.m. Lagos the day after the episode posts, and the
 * word with the most votes then wins (the ten-minute sweep closes it —
 * lib/drama/advance.ts). Every voter gets one private reply with the score so far.
 */

type Hit = {
  episode_id: string; n: number; status: string; decided_word: string | null; posted_at: string | null;
  content: { title: string; finale?: boolean; choice: { options: { word: string; label: string }[] } };
  story_id: string; slug: string; title: string; min_votes: number;
};

const GRAPH = "https://graph.instagram.com/v21.0";
const storyUrl = (slug: string) => `${SITE_URL.replace(/\/$/, "")}/d/drama/${slug}`;

async function episodeForMedia(mediaId: string): Promise<Hit | null> {
  const find = () => sql<Hit[]>`
    SELECT e.id AS episode_id, e.n, e.status, e.decided_word, e.posted_at, e.content, s.id AS story_id, s.slug, s.title, s.min_votes
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

  // Voting closes at 4 p.m. the day after the episode posts; after that a comment
  // is told it is closed even if the ten-minute sweep has not counted it yet.
  const closesAt = voteClosesAt(hit.posted_at ? new Date(hit.posted_at) : new Date());
  const late = Date.now() >= closesAt.getTime();

  const out = await sql.begin(async (tx) => {
    const [ep] = await tx<{ decided_word: string | null }[]>`
      SELECT decided_word FROM drama_episodes WHERE id = ${hit.episode_id} FOR UPDATE`;
    if (ep.decided_word) return { kind: "closed" as const, winner: ep.decided_word };
    const counted = await tx<{ word: string }[]>`SELECT word FROM drama_votes WHERE episode_id = ${hit.episode_id}`;
    // Past the deadline with enough votes: the sweep is about to close it; take no more.
    if (late && counted.length >= hit.min_votes) return { kind: "late" as const };
    const ins = await tx`
      INSERT INTO drama_votes (episode_id, word, voter, source) VALUES (${hit.episode_id}, ${word}, ${voter}, 'instagram')
      ON CONFLICT (episode_id, voter) DO NOTHING RETURNING id`;
    if (!ins.length) {
      const [mine] = await tx<{ word: string }[]>`SELECT word FROM drama_votes WHERE episode_id = ${hit.episode_id} AND voter = ${voter}`;
      return { kind: "again" as const, mine: mine?.word ?? word };
    }
    return { kind: "counted" as const, score: tally([...counted, { word }], hit.content.choice.options.map((o) => o.word)) };
  });

  console.log(`[drama vote] ${who} → ${word} on ${hit.slug} ep ${hit.n}: ${out.kind}`);
  if (creds) {
    const label = hit.content.choice.options.find((o) => o.word === word)?.label ?? "";
    const decides = hit.content.finale ? "decides how season two begins" : `writes Episode ${hit.n + 1}`;
    if (out.kind === "counted") {
      const score = out.score.map((x) => `${x.word} ${x.n}`).join(" · ");
      await answer(creds, c.commentId,
        `Your vote is in: ${word} — ${label.toLowerCase()}.\nSo far: ${score}. Voting closes at ${closesLabel(closesAt)} (Lagos time); the word with the most votes ${decides}.`, url);
    } else if (out.kind === "closed") {
      await answer(creds, c.commentId, `This vote has closed: ${out.winner} won. ${hit.content.finale ? "Season two is on its way." : `Episode ${hit.n + 1} is on its way.`}`, url);
    } else if (out.kind === "late") {
      await answer(creds, c.commentId, `Voting on this episode closed at ${closesLabel(closesAt)}. The next episode opens a new vote — see you there.`, url);
    } else {
      await answer(creds, c.commentId, `You've already voted ${out.mine} on this episode — one vote each. See how it is going:`, url);
    }
  }
  return true;
}
