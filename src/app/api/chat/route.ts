import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== "user") {
      return new Response("No user message found", { status: 400 });
    }

    // Query your RAG backend
    let ragData;
    try {
      const ragResponse = await fetch(
        "https://rag-api-0sg6.onrender.com/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: latestMessage.content,
            k: 4,
          }),
        }
      );

      console.log("RAG response status:", ragResponse);

      if (ragResponse.statusText !== "OK") {
        const errorText = await ragResponse.text();
        console.error("RAG backend error:", ragResponse.status, errorText);
        throw new Error(
          `RAG backend error: ${ragResponse.status} - ${errorText}`
        );
      }

      ragData = await ragResponse.json();
      console.log("RAG data:", ragData);
    } catch (fetchError) {
      console.error("Failed to connect to RAG backend:", fetchError);
      // Fallback - proceed without RAG context
      ragData = { relevantDocuments: [] };
    }

    // Stream the response from your RAG backend
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Use the following context from the knowledge base to answer questions accurately. If the answer is not in the context, say so clearly.",
        },
        {
          role: "user",
          content: `Context from knowledge base: ${
            ragData.relevantDocuments
              ?.map((doc: { content: string }) => doc.content)
              .join("\n\n") || "No relevant context found"
          }

User question: ${latestMessage.content}`,
        },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
