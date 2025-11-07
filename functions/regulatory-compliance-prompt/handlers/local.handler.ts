import { logger, promptRegulatoryComplianceEntrypoint } from "../app";

/**
 * Local Handler for Terminal Testing
 * Run with: npm run local:handler
 * 
 * This script allows you to test the regulatory compliance prompt functionality
 * directly from the command line without running a server.
 */

async function main() {
  try {
    // Example test data
    const testRequest = {
      messageId: "test-message-123",
      application: "DOCUMENT_LOAD", // Options: LETTER, WARRANTY, DOCUMENT_LOAD
      question: "¿Cuáles son los principales hallazgos del documento?",
      recordKeys: ["example-record-key-1", "example-record-key-2"],
    };

    logger.info("🧪 Starting local handler test...");
    logger.info({ testRequest }, "Test request data");

    const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest(testRequest);

    let fullResponse = "";

    logger.info("📝 Streaming response...");
    console.log("\n--- Response Start ---");

    for await (const chunk of promptRegComplOutput.result) {
      fullResponse += chunk;
      process.stdout.write(chunk);
    }

    console.log("\n--- Response End ---\n");

    logger.info("✅ Test completed successfully");
    logger.debug({ fullResponse }, "Full response");
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error }, "❌ Error in local handler");
      console.error("\n❌ Error:", error.message);
      process.exit(1);
    }
  }
}

// Run the handler
main();
