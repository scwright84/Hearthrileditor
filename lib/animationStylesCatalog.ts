export type StyleCategory =
  | "pets"
  | "kids"
  | "portraits"
  | "storybook"
  | "cinematic"
  | "retro"
  | "artsy"
  | "gaming";

export type AnimationStyleCatalogEntry = {
  id: string;
  internal_style_ref: string;
  branded_name: string;
  default_categories: StyleCategory[];
  description: string;
  mj_style_modifier?: string;
  reference_image_url?: string;
};

export const ANIMATION_STYLES_CATALOG: AnimationStyleCatalogEntry[] = [
  {
    id: "magic-wish",
    internal_style_ref: "Studio Ghibli (watercolor films)",
    branded_name: "Magic Wish",
    default_categories: ["kids", "storybook", "portraits", "pets"],
    description:
      "soft watercolor storybook animation, hand-painted look with gentle brush texture, rounded child-friendly proportions, warm pastel palette, diffuse glowing light, shallow depth framing, clean silhouette, no text or watermark",
    mj_style_modifier: "soft watercolor storybook animation, hand-painted, gentle brush texture",
    reference_image_url:
      "https://cdn.midjourney.com/5623246b-842a-4cda-9db3-3560a51fccb5/0_2.png",
  },
  {
    id: "cinematic-charm",
    internal_style_ref: "Pixar (modern era)",
    branded_name: "Cinematic Charm",
    default_categories: ["cinematic", "kids", "portraits", "pets"],
    description:
      "modern 3D animated family film style, clean smooth shapes, soft subsurface shading, warm cinematic lighting, rich but natural color, expressive eyes, gentle facial features, polished render, clean silhouette, no text or watermark",
    mj_style_modifier: "modern 3D animated family film style, polished render",
    reference_image_url:
      "https://cdn.midjourney.com/6e9121ac-d508-4d57-96c4-d0df26a0e7e7/0_2.png",
  },
  {
    id: "hero-spark",
    internal_style_ref: "DreamWorks Animation",
    branded_name: "Hero Spark",
    default_categories: ["cinematic", "kids", "portraits", "pets"],
    description:
      "stylized 3D animation with bold proportions, expressive faces, slightly sharper geometry, vibrant balanced palette, directional studio lighting, medium lens framing, clean silhouette, no text or watermark",
    mj_style_modifier: "stylized 3D animation, bold proportions, expressive faces",
    reference_image_url:
      "https://cdn.midjourney.com/04f4d726-4c24-4b21-b614-013a92a1c12c/0_2.png",
  },
  {
    id: "toon-glow",
    internal_style_ref: "Disney Toon Shader / Modern Disney+",
    branded_name: "Toon Glow",
    default_categories: ["kids", "portraits", "pets", "cinematic"],
    description:
      "toon-shaded 3D style with simplified surfaces, clear outlines, soft facial features, bright but controlled colors, even studio lighting, centered framing, minimal depth of field, clean silhouette, no text or watermark",
    mj_style_modifier: "toon-shaded 3D, simplified surfaces, clean outlines",
    reference_image_url:
      "https://cdn.midjourney.com/9b1c768a-0363-4c3d-a2d6-f2bdf0cf9b64/0_2.png",
  },
  {
    id: "classic-wonder",
    internal_style_ref: "Disney Renaissance (1990s)",
    branded_name: "Classic Wonder",
    default_categories: ["kids", "storybook", "portraits", "pets"],
    description:
      "traditional 2D hand-drawn animation look, elegant linework, soft facial expressions, warm nostalgic palette, gentle bounce lighting, storybook framing, clean silhouette, no text or watermark",
    mj_style_modifier: "traditional 2D hand-drawn animation, elegant linework",
    reference_image_url:
      "https://cdn.midjourney.com/a6cd4845-46ff-4543-b49e-36d0814628bf/0_0.png",
  },
  {
    id: "clay-critter",
    internal_style_ref: "Aardman / Laika",
    branded_name: "Clay Critter",
    default_categories: ["kids", "pets", "storybook"],
    description:
      "stop-motion clay animation style, rounded sculpted forms, visible fingerprints, warm earthy colors, soft bounce lighting, close-to-medium framing, tactile handmade feel, clean silhouette, no text or watermark",
    mj_style_modifier: "stop-motion clay animation, tactile handmade texture",
    reference_image_url:
      "https://cdn.midjourney.com/46b4ade5-56d4-455b-bf1e-9175d7a25a2f/0_1.png",
  },
  {
    id: "paper-patch",
    internal_style_ref: "South Park / Blue’s Clues paper era",
    branded_name: "Paper Patch",
    default_categories: ["kids", "storybook", "pets"],
    description:
      "paper cut-out animation style, layered flat shapes, simple facial details, muted playful palette, soft shadow lighting, orthographic framing, crisp edges, clean silhouette, no text or watermark",
    mj_style_modifier: "paper cut-out animation, layered flat shapes",
    reference_image_url:
      "https://cdn.midjourney.com/8d771ccf-96b7-487a-874c-0d14e317c683/0_2.png",
  },
  {
    id: "crayon-dream",
    internal_style_ref: "Children’s Crayon Book (Eric Carle–like)",
    branded_name: "Crayon Dream",
    default_categories: ["kids", "storybook", "pets"],
    description:
      "childlike crayon illustration style, loose hand-drawn lines, oversized eyes, warm saturated colors, even diffuse lighting, centered framing, textured paper grain, clean silhouette, no text or watermark",
    mj_style_modifier: "crayon illustration, textured paper grain, loose lines",
    reference_image_url:
      "https://cdn.midjourney.com/5683b1ce-b5e5-46e8-855c-cf9c1ad422ac/0_3.png",
  },
  {
    id: "pastel-drift",
    internal_style_ref: "Beatrix Potter / watercolor books",
    branded_name: "Pastel Drift",
    default_categories: ["kids", "storybook", "portraits", "pets"],
    description:
      "watercolor children’s book style, soft blended edges, delicate facial features, airy pastel palette, natural ambient light, wide gentle framing, painterly softness, clean silhouette, no text or watermark",
    mj_style_modifier: "watercolor children’s book, airy pastels, soft edges",
    reference_image_url:
      "https://cdn.midjourney.com/133b9426-2caa-4280-b8bd-40c162524b54/0_0.png",
  },
  {
    id: "bold-bounce",
    internal_style_ref: "Cartoon Network (modern flat 2D)",
    branded_name: "Bold Bounce",
    default_categories: ["kids", "pets", "portraits", "retro"],
    description:
      "flat 2D cartoon style, thick line weight, exaggerated proportions, high-contrast bright palette, simple lighting, graphic framing, clean readable silhouettes, no text or watermark",
    mj_style_modifier: "flat 2D cartoon, thick outlines, bold shapes",
    reference_image_url:
      "https://cdn.midjourney.com/55644496-d7d5-4817-b189-caf99af211dc/0_3.png",
  },
  {
    id: "toon-twist",
    internal_style_ref: "Disney 1930s / Rubber Hose",
    branded_name: "Toon Twist",
    default_categories: ["retro", "kids", "pets"],
    description:
      "vintage cartoon-inspired animation style, rubbery limbs, simplified faces, limited color palette, high-contrast lighting, playful wide framing, clean silhouette, no text or watermark",
    mj_style_modifier: "1930s rubber hose cartoon, playful bouncy shapes",
    reference_image_url:
      "https://cdn.midjourney.com/fc7043de-a2c4-41bf-afae-0798b1078698/0_0.png",
  },
  {
    id: "neon-legend",
    internal_style_ref: "1980s–90s Anime (Akira-era cel)",
    branded_name: "Neon Legend",
    default_categories: ["retro", "portraits", "kids", "cinematic"],
    description:
      "retro anime-inspired animation look, sharp expressive eyes, stylized proportions, saturated neon accents, dramatic contrast lighting, cinematic framing, clean silhouette, no text or watermark",
    mj_style_modifier: "retro cel-shaded anime, dramatic lighting, neon accents",
    reference_image_url:
      "https://cdn.midjourney.com/ec6c4c01-70d2-453e-814a-75d469fed3ab/0_2.png",
  },
  {
    id: "ink-whisper",
    internal_style_ref: "Traditional Japanese Sumi-e",
    branded_name: "Ink Whisper",
    default_categories: ["artsy", "portraits", "pets"],
    description:
      "ink-and-wash illustration style, flowing brush lines, minimalist facial features, monochrome or muted palette, soft directional light, elegant negative space, clean silhouette, no text or watermark",
    mj_style_modifier: "sumi-e ink wash, flowing brushwork, minimal palette",
    reference_image_url:
      "https://cdn.midjourney.com/fe8666f5-d031-4b3a-9fb1-e4fd4f17ed83/0_3.png",
  },
  {
    id: "color-breeze",
    internal_style_ref: "Impressionist Painting (Monet-like)",
    branded_name: "Color Breeze",
    default_categories: ["artsy", "portraits", "pets", "storybook"],
    description:
      "impressionist-inspired animation style, visible soft brush strokes, gentle facial abstraction, light-driven pastel palette, golden ambient lighting, loose framing, clean silhouette, no text or watermark",
    mj_style_modifier: "impressionist brush strokes, light-driven pastels",
    reference_image_url:
      "https://cdn.midjourney.com/c96ac5fd-67b3-46aa-b33f-4bccd651a65e/0_2.png",
  },
  {
    id: "emotion-burst",
    internal_style_ref: "Expressionist Painting (Munch-like)",
    branded_name: "Emotion Burst",
    default_categories: ["artsy", "portraits"],
    description:
      "expressionist animation style, bold angular strokes, exaggerated emotion, high-contrast saturated colors, dramatic lighting, dynamic off-center composition, clean silhouette, no text or watermark",
    mj_style_modifier: "expressionist, bold strokes, dramatic contrast",
    reference_image_url:
      "https://cdn.midjourney.com/b4f4acd6-e608-4b7f-98ea-a05a734c88ff/0_0.png",
  },
  {
    id: "pop-pulse",
    internal_style_ref: "Pop Art (Lichtenstein era)",
    branded_name: "Pop Pulse",
    default_categories: ["artsy", "portraits", "kids", "pets"],
    description:
      "pop-art inspired animation style, graphic shapes, simplified faces, bold primary colors, flat high-contrast lighting, poster-like framing, clean silhouette, no text or watermark",
    mj_style_modifier: "pop art, halftone vibe, bold primaries",
    reference_image_url:
      "https://cdn.midjourney.com/2c9161c5-8f02-4650-9a7e-4c30c4217999/0_3.png",
  },
  {
    id: "neon-tide",
    internal_style_ref: "Vaporwave / Synthwave Aesthetic",
    branded_name: "Neon Tide",
    default_categories: ["retro", "portraits", "gaming"],
    description:
      "vaporwave-inspired animation look, smooth gradients, soft stylized faces, cool neon palette, glowing ambient light, wide dreamy framing, clean silhouette, no text or watermark",
    mj_style_modifier: "vaporwave neon gradients, glowing ambient light",
    reference_image_url:
      "https://cdn.midjourney.com/69d2acb8-0e4b-41a8-a27f-3421d0cbd58e/0_0.png",
  },
  {
    id: "pixel-pop",
    internal_style_ref: "8–16 Bit Video Games (NES/SNES)",
    branded_name: "Pixel Pop",
    default_categories: ["gaming", "retro", "kids", "pets"],
    description:
      "retro pixel animation style, blocky simplified forms, limited facial detail, constrained color palette, flat lighting, centered game-like framing, clean silhouette, no text or watermark",
    mj_style_modifier: "pixel art sprite style, limited palette, crisp pixels",
    reference_image_url:
      "https://cdn.midjourney.com/5ec9457b-65e0-4cc7-9b2a-3ad4c52cdd6f/0_3.png",
  },
  {
    id: "plush-reality",
    internal_style_ref: "Plush Toy Photography / Toy Story props",
    branded_name: "Plush Reality",
    default_categories: ["kids", "pets", "portraits", "storybook"],
    description:
      "soft plush-toy animation style, rounded stuffed proportions, stitched details, warm cozy colors, studio softbox lighting, shallow depth framing, clean silhouette, no text or watermark",
    mj_style_modifier: "plush toy texture, stitched seams, softbox lighting",
    reference_image_url:
      "https://cdn.midjourney.com/b448bc94-ec43-49a3-adcd-e0a23c026798/0_3.png",
  },
  {
    id: "poly-point",
    internal_style_ref: "Low-Poly Games / Early 3D",
    branded_name: "Poly Point",
    default_categories: ["gaming", "cinematic", "pets"],
    description:
      "low-poly 3D animation style, geometric forms, simplified facial planes, clean modern palette, neutral studio lighting, wide clear composition, clean silhouette, no text or watermark",
    mj_style_modifier: "low-poly 3D, geometric facets, clean modern palette",
    reference_image_url:
      "https://cdn.midjourney.com/feffc4bc-cc25-41b9-85c4-00305c65ad09/0_0.png",
  },
];
