import { loadConfig } from "../server/config";
import { startSessionManager, stopSessionManager } from "../server/sessions/manager";
import { getGraphUser, unfollowUser, getGraphFollowing } from "../server/twitter/api";

async function run() {
  loadConfig();
  await startSessionManager();

  const accounts = [
    "BBCWorld", "Reuters", "AP", "TheEconomist", "CNN", "nytimes", 
    "WSJ", "AlJazeera", "Bloomberg", "TechCrunch", "WIRED", 
    "NASA", "SpaceX", "NatGeo"
  ];

  for (const handle of accounts) {
    try {
      const user = await getGraphUser(handle);
      if (user && user.id) {
        const result = await unfollowUser(user.id);
        console.log(`Unfollowed @${handle} (${user.id}): ${result}`);
      }
    } catch {
      console.log(`Failed to unfollow @${handle}`);
    }
  }

  stopSessionManager();
  process.exit(0);
}

run();
