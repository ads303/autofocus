import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- helper: classify device & capabilities ---
function classifyDevice(model = "") {
  const raw = model || "";
  const m = raw.toLowerCase();

  if (m.includes("iphone")) {
    return {
      type: "SMARTPHONE",
      family: "Apple iPhone",
      platform: "iOS",
      exampleFeatures:
        "Auto HDR, Night mode, Portrait mode, Live Photos, exposure slider, AE/AF lock, 0.5× / 1× / 2× / 3× lenses depending on model",
    };
  }

  if (m.includes("pixel")) {
    return {
      type: "SMARTPHONE",
      family: "Google Pixel",
      platform: "Android",
      exampleFeatures:
        "Night Sight, HDR+, Portrait mode, exposure slider, tap-to-focus, 3s/10s timer",
    };
  }

  if (m.includes("samsung") || m.includes("galaxy")) {
    return {
      type: "SMARTPHONE",
      family: "Samsung Galaxy",
      platform: "Android",
      exampleFeatures:
        "Night mode, Pro mode on some models, Portrait mode, exposure slider, tap-to-focus, 3s/10s timer",
    };
  }

  if (
    m.includes("android") ||
    m.includes("oneplus") ||
    m.includes("xiaomi") ||
    m.includes("huawei")
  ) {
    return {
      type: "SMARTPHONE",
      family: "Android smartphone",
      platform: "Android",
      exampleFeatures:
        "Night mode, Portrait mode, HDR, exposure slider, tap-to-focus, 3s/10s timer",
    };
  }

  // default assumption: dedicated camera
  return {
    type: "CAMERA",
    family: raw || "Unknown camera",
    platform: "Camera",
    exampleFeatures:
      "Manual aperture, shutter speed, ISO controls, drive modes, metering modes, AF modes",
  };
}

// --- prompt builder: smartphone vs camera schemas ---
function buildPrompt({ scenario, cameraModel, lens, constraints }) {
  const deviceInfo = classifyDevice(cameraModel);
  const phone = deviceInfo.type === "SMARTPHONE";
  const deviceType = deviceInfo.type; // "SMARTPHONE" or "CAMERA"

  // SMARTPHONE SCHEMA (no aperture/shutter/ISO dials)
  const smartphoneSchema = `
Return ONLY a valid JSON object with exactly this shape:

{
  "device_type": "SMARTPHONE",
  "mode": "Auto HDR",
  "lens": "Main wide lens (1×)",
  "stability": "3s timer, brace phone on rock or car",
  "exposure_adjustment": "Slightly lower the exposure slider",
  "focus_action": "Tap to focus, then hold to lock AE/AF",
  "notes": "Short 1–2 sentence explanation referencing actual phone features, NOT manual shutter/ISO/aperture dials.",
  "variant_brighter": {
    "exposure_adjustment": "Raise exposure slider slightly",
    "notes": "Short explanation focused on phone actions, not ISO/shutter dials."
  },
  "variant_more_bokeh": {
    "mode": "Portrait mode (1×)",
    "notes": "Short explanation focused on phone actions, not aperture numbers."
  }
}
`;

  // CAMERA SCHEMA (traditional exposure settings)
  const cameraSchema = `
Return ONLY a valid JSON object with exactly this shape:

{
  "device_type": "CAMERA",
  "aperture": "f/2.8",
  "shutter_speed": "1/250",
  "iso": 400,
  "white_balance": "Daylight",
  "focus_mode": "AF-C",
  "metering_mode": "Matrix",
  "drive_mode": "Single",
  "notes": "Short explanation (1–2 sentences).",
  "variant_brighter": {
    "aperture": "f/2.0",
    "shutter_speed": "1/250",
    "iso": 800
  },
  "variant_more_bokeh": {
    "aperture": "f/1.4",
    "shutter_speed": "1/500",
    "iso": 1600
  }
}
`;

  const smartphoneRules = `
SMARTPHONE RULES (CRITICAL, JSON-ONLY):

- The user CANNOT directly dial aperture, shutter speed, or ISO in the default camera app.
- NEVER instruct: "set shutter to 1/250", "set ISO to 800", or "use f/8" on a smartphone.
- You may mention those concepts only indirectly, e.g. "the phone will choose a faster shutter", but NOT as something the user dials.
- Focus on actions the user can actually perform:
  • Enable Night mode / Auto HDR / Portrait mode
  • Choose main wide lens vs ultra-wide vs telephoto
  • Tap to focus, long-press to lock AE/AF
  • Use the 3s or 10s timer
  • Brace the phone on a surface (rock, car roof, railing, tripod)
  • Drag the exposure slider slightly up/down
- "notes" MUST talk about phone features and gestures, NOT “set ISO x” or “use f/x”.
- "variant_brighter" and "variant_more_bokeh" must ALSO be expressed in terms of modes/actions (longer Night mode, Portrait mode, moving closer), not numeric shutter/ISO changes.
- Do NOT add or remove top-level keys from the SMARTPHONE schema.
`;

  const cameraRules = `
CAMERA RULES (JSON-ONLY):

- The user has direct control over aperture, shutter speed, ISO, white balance, AF mode, metering, and drive mode.
- Provide concrete, dialable settings for a competent enthusiast.
- Balance motion blur, noise, and depth of field based on scenario and constraints.
- Keep "notes" short (1–2 sentences) and focused on tradeoffs.
- Do NOT add or remove top-level keys from the CAMERA schema.
- "iso" must be a NUMBER (not a string).
- "shutter_speed" must be a STRING like "1/125" or "0.5s".
`;

  const deviceDetails = `
DEVICE DETAILS:
- Raw camera string: "${cameraModel || "N/A"}"
- Detected family: ${deviceInfo.family}
- Platform: ${deviceInfo.platform}
- Typical features: ${deviceInfo.exampleFeatures}
`;

  return `
You are an expert photography assistant.

Your job is to give fast, practical, baseline settings that the user can dial in (for real cameras)
OR concrete mode/gesture recommendations (for smartphones).

You MUST return valid JSON and nothing else. The system is in JSON mode.

DEVICE TYPE DETECTED: ${deviceType}

${deviceDetails}

${phone ? "SMARTPHONE CONTEXT:" : "CAMERA CONTEXT:"}
${phone ? smartphoneRules : cameraRules}

JSON SCHEMA YOU MUST FOLLOW (no extra top-level keys, no missing keys):

${phone ? smartphoneSchema : cameraSchema}

GLOBAL JSON RULES (VERY IMPORTANT):
- Output MUST be a single JSON object only (no markdown, no backticks, no prose outside JSON).
- Start your reply with '{' and end it with '}'.
- The word "json" is already present in these instructions; you do not need to say it again.

User input (for context):

Scenario: ${scenario || "N/A"}
Camera: ${cameraModel || "N/A"}
Lens: ${lens || "N/A"}
Constraints: ${constraints || "None"}

Remember: you are in JSON mode for the Responses API, so your output must be a single, well-formed JSON object that matches the chosen schema.
`;
}

// --- API route ---
app.post("/api/camera-settings", async (req, res) => {
  try {
    const { scenario, cameraModel, lens, constraints } = req.body || {};

    const prompt = buildPrompt({ scenario, cameraModel, lens, constraints });

    const response = await client.responses.create({
      model: "gpt-5.1", // or "gpt-5.1" if you want the full model
      input: prompt,
      // NEW: Responses API uses text.format instead of response_format
      text: {
        format: { type: "json_object" },
      },
      temperature: 0.4,
    });

    // Prefer output_text if present; otherwise fall back to first output_text content item
    let raw = (response.output_text || "").trim();

    if (!raw) {
      const firstMsg = response.output && response.output[0];
      const firstContent =
        firstMsg &&
        firstMsg.content &&
        firstMsg.content.find((c) => c.type === "output_text");
      if (firstContent && typeof firstContent.text === "string") {
        raw = firstContent.text.trim();
      }
    }

    if (!raw) {
      console.error("No text returned from model:", JSON.stringify(response, null, 2));
      return res
        .status(500)
        .json({ error: "Model returned empty text. Check server logs." });
    }

    let settings;
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse JSON from model:", raw);
      return res.status(500).json({
        error:
          "Model did not return valid JSON. Check server logs and the buildPrompt schema.",
      });
    }

    res.json(settings);
  } catch (err) {
    console.error("Unexpected error in /api/camera-settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Camera Lens GPT server running on http://localhost:${PORT}`);
});
