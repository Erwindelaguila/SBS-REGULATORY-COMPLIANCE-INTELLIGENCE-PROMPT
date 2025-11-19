import express, { Request, Response } from "express";
import cors from "cors";
import { Packer } from "docx";
import { promptRegulatoryComplianceEntrypoint } from "../app";
import { DocumentGeneratorService } from "../source/services/document-generator.service";

/**
 * Local Express Server for Testing
 * Run with: npm run local:server
 * Test with: POST http://localhost:3001/chat
 */

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware CORS - Permitir peticiones desde cualquier origen
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

// Middleware
app.use(express.json());

// Middleware para logs bonitos
app.use((req, _res, next) => {
  const timestamp = new Date().toLocaleTimeString("es-PE", { hour12: false });
  const method = req.method.padEnd(7);
  console.log(`\n[${timestamp}] ${method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  console.log("  ✅ Health check OK");
  res.json({ status: "ok", service: "regulatory-compliance-prompt" });
});

// Root endpoint - Info
app.get("/", (_req: Request, res: Response) => {
  console.log("  ℹ️  Info request");
  res.json({
    service: "Regulatory Compliance Chat Server",
    version: "1.0.0",
    endpoints: {
      chat: "POST /",
      generateDocument: "POST /generate-document",
      health: "GET /health"
    },
    status: "running"
  });
});

// Main chat endpoint (root)
app.post("/", async (req: Request, res: Response) => {
  try {
    const { sessionId, application, question, recordKeys, conversationHistory } = req.body;

    console.log(`  📨 Session: ${sessionId}`);
    console.log(`  📋 App: ${application}`);
    console.log(`  ❓ Question: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`);
    console.log(`  💬 History: ${conversationHistory?.length || 0} messages`);

    if (!sessionId || !application || !question) {
      console.log("  ❌ Missing required fields");
      return res.status(400).json({
        error: "Missing required fields: sessionId, application, question",
      });
    }

    const messageId = sessionId.split(":")[1] || sessionId;

    console.log("  🤖 Processing with AI...");

    const promptRegComplOutput = await promptRegulatoryComplianceEntrypoint.handleRequest({
      messageId, // SessionId
      application: application as string, // LETTER, WARRANTY, DOCUMENT_LOAD
      question: question as string, // User input
      recordKeys: recordKeys as string[] || [], // DOCUMENT LOAD
      conversationHistory: conversationHistory || [], // 👈 NUEVO: Historial para iteración
    });

    let fullResponse = "";

    // Check if document was generated (for WARRANTY only)
    const isDocumentGenerated = promptRegComplOutput.isDocumentGenerated || false;
    const documentType = promptRegComplOutput.documentType || null;

    console.log(`  📄 Document generated: ${isDocumentGenerated} (${documentType})`);

    // Send headers to indicate if document was generated
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Document-Generated", isDocumentGenerated.toString());
    if (documentType) {
      res.setHeader("X-Document-Type", documentType);
    }
    
    // ✅ EXPONER headers personalizados para que el frontend pueda leerlos (CORS)
    res.setHeader("Access-Control-Expose-Headers", "X-Document-Generated, X-Document-Type");

    for await (const chunk of promptRegComplOutput.result) {
      fullResponse += chunk;
      res.write(chunk);
      
      // Log progreso cada 5000 caracteres
      if (fullResponse.length % 5000 < chunk.length) {
        console.log(`  📊 Progress: ${fullResponse.length} chars...`);
      }
    }

    res.end();

    console.log(`  ✅ Response sent (${fullResponse.length} chars)`);
    console.log(`  📝 First 200 chars: ${fullResponse.substring(0, 200)}`);
    console.log(`  📝 Last 200 chars: ${fullResponse.substring(fullResponse.length - 200)}`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`  ❌ Error: ${error.message}`);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    } else {
      console.log("  ❌ Unknown error");
      res.status(500).json({ error: "Unknown error occurred" });
    }
  }
});

// Generate Word document endpoint
app.post("/generate-document", async (req: Request, res: Response) => {
  try {
    const { markdownContent, application } = req.body;

    console.log(`  📄 Generating ${application} document from Markdown...`);

    if (!markdownContent || typeof markdownContent !== 'string') {
      console.log("  ❌ Missing or invalid markdownContent");
      return res.status(400).json({
        error: "Missing required field: markdownContent (must be string)",
      });
    }

    // Create document generator service
    const documentGenerator = new DocumentGeneratorService();
    
    // Generate Word document from Markdown
    const doc = documentGenerator.generateWarrantyObservationDocument(markdownContent);
    
    // Convert to buffer
    const buffer = await Packer.toBuffer(doc);
    
    // Extract period from markdown for filename (if possible)
    const periodMatch = markdownContent.match(/Período:\s*([^\n]+)/);
    const period = periodMatch ? periodMatch[1].trim().replace(/\s+/g, '-') : 'documento';
    
    // Set headers for file download
    const filename = `observacion-garantias-${period}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    
    // Send file
    res.send(buffer);
    
    console.log(`  ✅ Document generated: ${filename} (${buffer.length} bytes)`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`  ❌ Error generating document: ${error.message}`);
      res.status(500).json({
        error: "Error generating document",
        message: error.message,
      });
    } else {
      console.log("  ❌ Unknown error");
      res.status(500).json({ error: "Unknown error occurred" });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.clear();
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        🚀 REGULATORY COMPLIANCE CHAT SERVER 🚀            ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log("  📡 Status:     RUNNING");
  console.log(`  🌐 Server:     http://localhost:${PORT}`);
  console.log(`  💬 Chat:       POST http://localhost:${PORT}/`);
  console.log(`  � Document:   POST http://localhost:${PORT}/generate-document`);
  console.log(`  �💚 Health:     GET  http://localhost:${PORT}/health`);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  Waiting for requests...\n");
});

export default app;
