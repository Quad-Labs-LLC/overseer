import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultModel, getModelById } from "@/agent/providers";
import { saveUserSoulSupplement } from "@/agent/soul";
import { saveUserIdentity } from "@/agent/identity";
import { upsertLongTermMemory } from "@/agent/super-memory";
import { generateText } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export interface QuizAnswers {
  // About the user
  name: string;
  pronouns?: string;
  role: string;
  experience: "beginner" | "intermediate" | "advanced" | "expert";
  primaryGoal: "devops" | "coding" | "business" | "learning" | "research" | "mixed";
  workStyle: "deep_focus" | "multitasker" | "collaborative" | "structured" | "spontaneous";
  timezone?: string;

  // AI personality
  agentName: string;
  tone: "casual" | "professional" | "direct" | "warm" | "witty";
  verbosity: "concise" | "balanced" | "detailed" | "adaptive";
  decisionStyle: "recommend_one" | "offer_options" | "explain_then_act" | "just_do_it";
  proactivity: "highly_proactive" | "suggest_when_relevant" | "only_when_asked";
  technicalDepth: "always_explain" | "explain_on_request" | "assume_expert";
  uncertainty: "ask_first" | "state_assumption" | "best_guess";
  confirmations: "always" | "risky_only" | "catastrophic_only";

  // Personality / vibe
  humor: "none" | "light" | "playful";
  empathy: "minimal" | "balanced" | "high";
  creativity: "analytical" | "balanced" | "creative";
  learningStyle: "examples" | "concepts" | "hands_on" | "mixed";
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { answers, providerId }: { answers: QuizAnswers; providerId?: number } = body;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "answers required" }, { status: 400 });
    }

    const model = providerId ? getModelById(providerId) : getDefaultModel();
    if (!model) {
      return NextResponse.json({ error: "No AI model available" }, { status: 500 });
    }

    // ── 1. Store key facts as long-term memories ─────────────────────────────
    const userId = user.id;
    const memories: Array<{ key: string; value: string; category: "fact" | "preference" | "goal" }> = [
      { key: "user.name", value: answers.name || user.username, category: "fact" },
      { key: "user.role", value: answers.role, category: "fact" },
      { key: "user.experience_level", value: answers.experience, category: "fact" },
      { key: "user.primary_goal", value: answers.primaryGoal, category: "goal" },
      { key: "user.work_style", value: answers.workStyle, category: "preference" },
      { key: "agent.name", value: answers.agentName || "Overseer", category: "preference" },
      { key: "style.tone", value: answers.tone, category: "preference" },
      { key: "style.verbosity", value: answers.verbosity, category: "preference" },
      { key: "style.decision_style", value: answers.decisionStyle, category: "preference" },
      { key: "style.proactivity", value: answers.proactivity, category: "preference" },
      { key: "style.technical_depth", value: answers.technicalDepth, category: "preference" },
      { key: "style.uncertainty_handling", value: answers.uncertainty, category: "preference" },
      { key: "style.confirmations", value: answers.confirmations, category: "preference" },
      { key: "personality.humor", value: answers.humor, category: "preference" },
      { key: "personality.empathy", value: answers.empathy, category: "preference" },
      { key: "personality.creativity", value: answers.creativity, category: "preference" },
      { key: "personality.learning_style", value: answers.learningStyle, category: "preference" },
    ];
    if (answers.pronouns?.trim()) {
      memories.push({ key: "user.pronouns", value: answers.pronouns.trim(), category: "fact" });
    }
    if (answers.timezone?.trim()) {
      memories.push({ key: "user.timezone", value: answers.timezone.trim(), category: "fact" });
    }
    for (const m of memories) {
      upsertLongTermMemory(userId, m.key, m.value, m.category, 8, "onboarding");
    }

    // ── 2. Generate IDENTITY.md via AI ───────────────────────────────────────
    const identityPrompt = `Write an IDENTITY.md document that tells a personal AI assistant exactly who it's talking to.

This gets injected directly into the assistant's system prompt so it always knows the person behind the keyboard.

Quiz answers:
- Name: ${answers.name || user.username}
${answers.pronouns ? `- Pronouns: ${answers.pronouns}` : ""}
- What they do: ${answers.role}
- Experience level: ${answers.experience}
- Main use case: ${answers.primaryGoal}
- Work style: ${answers.workStyle}
- Learning style: ${answers.learningStyle}
${answers.timezone ? `- Timezone: ${answers.timezone}` : ""}

Write in Markdown, factual and useful, under 250 words. Third-person perspective ("The user is...", "They...") since the AI reads this as knowledge about the person. Sections:
- ## Who they are (name, role, experience, pronouns if given)
- ## What they use me for (goals, work patterns)
- ## How they think (learning style, decision-making)
- ## Notes (timezone, anything else worth knowing)

Output ONLY the Markdown. No intro, no explanation.`;

    // ── 3. Generate SOUL.md via AI ───────────────────────────────────────────
    const soulPrompt = `Write a personal SOUL.md supplement that fine-tunes how the AI assistant called "${answers.agentName || "Overseer"}" behaves for this specific person.

This is an addendum to the base personality — it makes the AI feel tailor-made. Be concrete and specific. The assistant follows these literally.

User's preferences:
- Tone: ${answers.tone}
- Verbosity: ${answers.verbosity}
- Decisions: ${answers.decisionStyle}
- Proactivity: ${answers.proactivity}
- Technical depth: ${answers.technicalDepth}
- When uncertain: ${answers.uncertainty}
- Confirmations: ${answers.confirmations}
- Humor: ${answers.humor}
- Empathy: ${answers.empathy}

Context:
- Role: ${answers.role} (${answers.experience} level)
- Primary use: ${answers.primaryGoal}

Sections (Markdown, under 350 words total):
- ## Voice — exactly how to speak to this person. Specific phrasing, things to say and avoid.
- ## Decisions — when to just act vs when to ask. How to present options.
- ## Technical Depth — how detailed to be, verbosity of code/explanations.
- ## Proactivity — when to volunteer next steps, when to just answer.
- ## Confirmations — what needs a confirmation, what to just do.
- ## Personality — humor calibration, energy, empathy style.

Be specific, give concrete examples. No generic advice.
Output ONLY the Markdown. No intro, no explanation.`;

    const [identityResult, soulResult] = await Promise.all([
      generateText({ model, prompt: identityPrompt, maxRetries: 1, maxOutputTokens: 800 }),
      generateText({ model, prompt: soulPrompt, maxRetries: 1, maxOutputTokens: 1000 }),
    ]);

    const identityContent = identityResult.text.trim();
    const soulContent = soulResult.text.trim();

    // ── 4. Save files ────────────────────────────────────────────────────────
    saveUserIdentity(userId, identityContent);
    saveUserSoulSupplement(userId, soulContent);

    return NextResponse.json({
      success: true,
      identity: identityContent,
      soul: soulContent,
    });
  } catch (err) {
    console.error("Profile generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
