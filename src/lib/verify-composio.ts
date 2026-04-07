import { createAndExecuteTask } from './executor-enhanced';
import * as dotenv from 'dotenv';
dotenv.config();

async function verifyComposioStabilization() {
  const userId = "test-user-" + Date.now();
  const query = "fetch my last 5 emails";
  
  console.log(`[Verification] Starting task: "${query}" for user: ${userId}`);
  
  try {
    const result = await createAndExecuteTask(query, userId);
    console.log(`[Verification] Result status: ${result.status}`);
    if (result.status === 'failed' && result.error) {
       console.log(`[Verification] Expected failure if not authenticated, but check for retry logs above.`);
    }
    console.log(`[Verification] Full Result:`, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`[Verification] Execution crashed:`, err);
  }
}

// Note: To run this, you'd need the environment variables and a valid build
// verifyComposioStabilization();
console.log("Verification script ready. Run with: bun run src/lib/verify-composio.ts");
