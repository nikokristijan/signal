import { beforeEach, describe, expect, it } from "vitest";
import { getChallengeForDate } from "@/lib/data/challenges";
import { LocalRepository } from "@/lib/repo/local";

const TODAY = "2026-11-10";
let repo: LocalRepository;

beforeEach(() => {
  repo = new LocalRepository();
});

describe("LocalRepository full flow", () => {
  it("plays a challenge: wrong guess, reveal, correct guess, leaderboard", async () => {
    const me = await repo.ensureProfile();
    expect(me.username).toMatch(/^player\d{4}$/);
    const challenge = await repo.getChallenge(TODAY);
    expect(challenge).not.toHaveProperty("answer");
    expect(challenge.stages).toHaveLength(5);

    const start = await repo.startAttempt(challenge);
    expect(start.stage).toBe(1);
    expect(start.score).toBe(500);
    expect(await repo.getReveal(challenge.id)).toBeNull(); // no spoilers while playing

    const wrong = await repo.submitGuess(challenge.id, "definitely wrong");
    expect(wrong.verdict).toBe("wrong");
    expect(wrong.attempt.score).toBe(450);

    const revealed = await repo.revealNextStage(challenge.id);
    expect(revealed.stage).toBe(2);
    expect(revealed.score).toBe(350);

    const answer = getChallengeForDate(TODAY).answer;
    const right = await repo.submitGuess(challenge.id, answer.toUpperCase());
    expect(right.verdict).toBe("correct");
    expect(right.attempt.score).toBe(350);
    expect(right.attempt.solvedStage).toBe(2);
    expect((await repo.getReveal(challenge.id))?.answer).toBe(answer);

    // persisted: a fresh repository instance on the same storage sees it
    expect((await repo.getAttempt(challenge.id))?.status).toBe("solved");

    const daily = await repo.getLeaderboard("daily", TODAY);
    expect(daily.find((r) => r.isMe)?.points).toBe(350);
    const friends = await repo.getLeaderboard("friends", TODAY);
    expect(friends.some((r) => r.isMe)).toBe(true);
    expect(friends.length).toBeGreaterThan(1);
  });

  it("only allows one attempt per day: starting again returns the same one", async () => {
    await repo.ensureProfile();
    const c = await repo.getChallenge(TODAY);
    await repo.startAttempt(c);
    await repo.submitGuess(c.id, "nope");
    expect((await repo.startAttempt(c)).wrongCount).toBe(1);
  });

  it("friends: add by username, reject unknown, self and duplicates", async () => {
    const me = await repo.ensureProfile();
    expect((await repo.listFriends(TODAY)).length).toBe(3);
    expect((await repo.addFriend("kai", TODAY)).ok).toBe(true);
    expect((await repo.addFriend("kai", TODAY)).ok).toBe(false);
    expect((await repo.addFriend("nobody_here", TODAY)).ok).toBe(false);
    expect((await repo.addFriend(me.username, TODAY)).ok).toBe(false);
    expect((await repo.listFriends(TODAY)).length).toBe(4);
  });

  it("validates usernames on profile update", async () => {
    await repo.ensureProfile();
    expect((await repo.updateProfile({ username: "ab" })).ok).toBe(false);
    expect((await repo.updateProfile({ username: "maya" })).ok).toBe(false); // taken
    const ok = await repo.updateProfile({ username: "Fresh_Name" });
    expect(ok.ok && ok.value.username).toBe("fresh_name");
  });
});
