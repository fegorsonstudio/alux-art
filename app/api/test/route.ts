import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export async function GET() {
  try {
    const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: "Abstract mood background",
        num_images: 1,
        aspect_ratio: "4:5",
        output_format: "png",
        safety_tolerance: "6",
        image_urls: ["https://v3b.fal.media/files/b/0a9a8d1d/kJejWeeu1Igj07PPab9cs_r597u4yO.png"],
        resolution: "4K",
        limit_generations: false,
      },
    });
    return NextResponse.json({ success: true, response });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), details: err });
  }
}
