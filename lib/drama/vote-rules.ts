/**
 * How an episode's vote is decided (owner, 2026-10-21: "what if more than two
 * people vote … before the time for the post, it has to change").
 *
 * Voting stays open until 4 p.m. Lagos on the first day at least 12 hours after
 * the episode posts — for a 7 p.m. post that is 4 p.m. the next day, three hours
 * before the next episode goes up. Then the word with the MOST votes wins; a tie
 * goes to the word that reached that number first. With fewer than the story's
 * min_votes in total, voting stays open and closes as soon as there are enough.
 * Shared by the vote handler, the sweep that closes votes, and the slides.
 */

export const CLOSE_HOUR_LAGOS = 16; // 4 p.m. in Lagos (UTC+1, no daylight saving)
export const CLOSES_TEXT = "4 p.m.";

export function voteClosesAt(postedAt: Date): Date {
  const earliest = postedAt.getTime() + 12 * 60 * 60_000;
  const lagos = new Date(earliest + 60 * 60_000);
  let at = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), CLOSE_HOUR_LAGOS - 1, 0, 0);
  if (at < earliest) at += 24 * 60 * 60_000;
  return new Date(at);
}

export type Tally = { word: string; n: number }[];

export function tally(votes: { word: string }[], options: string[]): Tally {
  return options.map((word) => ({ word, n: votes.filter((v) => v.word === word).length }));
}

/** The winner: most votes; a tie goes to the word whose last counted vote came first. Null with no votes. */
export function winnerOf(votes: { word: string; created_at: string | Date }[], options: string[]): string | null {
  const t = tally(votes, options);
  const top = Math.max(0, ...t.map((x) => x.n));
  if (!top) return null;
  const tied = t.filter((x) => x.n === top).map((x) => x.word);
  if (tied.length === 1) return tied[0];
  const reached = (w: string) => {
    const mine = votes.filter((v) => v.word === w).map((v) => new Date(v.created_at).getTime()).sort((a, b) => a - b);
    return mine[top - 1];
  };
  return tied.sort((a, b) => reached(a) - reached(b))[0];
}

/** "4 p.m. on Thursday" in Lagos time. */
export function closesLabel(at: Date): string {
  const day = at.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "long" });
  return `${CLOSES_TEXT} on ${day}`;
}
