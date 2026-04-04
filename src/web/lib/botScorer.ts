/**
 * Bot / Inauthentic Behavior Scorer
 * 
 * Assigns a 0–100 "bot probability" score based on heuristics.
 * Higher = more suspicious.
 */

export interface BotScoreResult {
  score: number;      // 0–100
  label: "human" | "suspicious" | "likely_bot";
  reasons: string[];
}

export function scoreBotProbability(user: {
  username?: string;
  fullname?: string;
  followers?: number;
  following?: number;
  tweets?: number;
  userPic?: string;
  bio?: string;
  joined?: string | Date;
}): BotScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Follower/Following ratio — bots often follow many, have few followers
  const followers = user.followers ?? 0;
  const following = user.following ?? 0;
  if (following > 0 && followers > 0) {
    const ratio = followers / following;
    if (ratio < 0.05) {
      score += 25;
      reasons.push("Very low follower/following ratio");
    } else if (ratio < 0.15) {
      score += 12;
      reasons.push("Low follower/following ratio");
    }
  } else if (following > 50 && followers === 0) {
    score += 30;
    reasons.push("No followers despite following many");
  }

  // 2. Username pattern — random digits appended
  const username = user.username ?? "";
  if (/[A-Za-z]+\d{6,}$/.test(username)) {
    score += 20;
    reasons.push("Username has many trailing digits");
  } else if (/\d{4,}$/.test(username)) {
    score += 10;
    reasons.push("Username ends with several digits");
  }

  // 3. Default / missing profile picture
  if (!user.userPic || user.userPic.includes("default_profile")) {
    score += 15;
    reasons.push("Default profile picture");
  }

  // 4. No bio
  if (!user.bio || user.bio.trim().length === 0) {
    score += 8;
    reasons.push("No bio");
  }

  // 5. Very few tweets
  const tweets = user.tweets ?? 0;
  if (tweets < 5) {
    score += 12;
    reasons.push("Very few tweets");
  } else if (tweets < 20) {
    score += 5;
    reasons.push("Few tweets");
  }

  // 6. Account age — newer accounts are more suspicious
  if (user.joined) {
    const joinDate = new Date(user.joined);
    const ageMonths = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths < 1) {
      score += 15;
      reasons.push("Account less than 1 month old");
    } else if (ageMonths < 3) {
      score += 8;
      reasons.push("Account less than 3 months old");
    }
  }

  // 7. Name matches common bot patterns
  const fullname = user.fullname ?? "";
  if (/^[A-Z][a-z]+\d+$/.test(fullname)) {
    score += 10;
    reasons.push("Name matches bot naming pattern");
  }

  // Cap at 100
  score = Math.min(100, score);

  const label: BotScoreResult["label"] =
    score >= 60 ? "likely_bot" :
    score >= 30 ? "suspicious" :
    "human";

  return { score, label, reasons };
}
