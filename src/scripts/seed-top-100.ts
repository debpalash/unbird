import { loadConfig } from "../server/config";
import { startSessionManager, stopSessionManager } from "../server/sessions/manager";
import { getGraphUser, followUser } from "../server/twitter/api";

const TOP_ACCOUNTS = [
  // News & World
  "BBCWorld", "Reuters", "AP", "TheEconomist", "CNN", "nytimes", "WSJ", "AlJazeera", "Bloomberg", "TechCrunch", "WIRED",
  // Science & Space
  "NASA", "SpaceX", "NatGeo", "neiltyson", "PopSci", "Discovery", "ScienceMagazine", "xkcd", "Cmdr_Hadfield",
  // Tech & Innovators
  "elonmusk", "BillGates", "tim_cook", "sundarpichai", "satyanadella", "lexfridman", "MKBHD", "YCombinator", "OpenAI", "sama",
  // Pop Culture & Film
  "PopBase", "PopCrave", "DiscussingFilm", "IGN", "Netflix", "MarvelStudios", "YouTube", "TheAcademy", "RottenTomatoes",
  // Sports & Culture
  "FabrizioRomano", "ESPN", "ChampionsLeague", "NBA", "NFL", "Cristiano", "bleacherreport", "brfootball",
  // Creators & Music
  "MrBeast", "taylorswift13", "theweeknd", "badbunny", "drake", "ladygaga", "billieeilish", "KSI", "LoganPaul", "xQc", "KaiCenat", "iShowSpeed",
  // Finance & Markets
  "bespokeinvest", "Stocktwits", "zerohedge", "CNBC",
  // Gaming
  "NintendoAmerica", "PlayStation", "Xbox", "pcgamer",
  // Global & General
  "X", "historyinmemes", "memes", "fasc1nate", "gunsnrosesgirl3"
];

async function run() {
  console.log("[Seeder] Loading config and starting session manager...");
  loadConfig();
  await startSessionManager();

  console.log(`[Seeder] Ready to seed ${TOP_ACCOUNTS.length} accounts. Wait ~2s per account...`);

  let followed = 0;
  for (const handle of TOP_ACCOUNTS) {
    try {
      console.log(`[Seeder] Processing @${handle}...`);
      const user = await getGraphUser(handle);
      if (user && user.id) {
        const result = await followUser(user.id);
        if (result) {
          console.log(`[Seeder] -> ✅ Successfully followed ${handle} (ID: ${user.id})`);
          followed++;
        } else {
          console.log(`[Seeder] -> ❌ Failed to follow ${handle}`);
        }
      } else {
        console.log(`[Seeder] -> ❌ Could not resolve ID for ${handle}`);
      }
    } catch (e: any) {
      console.error(`[Seeder] -> ❌ Error for ${handle}:`, e.message);
    }
    
    // Add jittered delay to prevent aggressive rate limiting (1.5s - 2.5s)
    const delayMs = 1500 + Math.random() * 1000;
    await new Promise(r => setTimeout(r, delayMs));
  }

  console.log(`\n[Seeder] Finished. Successfully followed ${followed}/${TOP_ACCOUNTS.length} accounts.`);
  stopSessionManager();
  process.exit(0);
}

run();
