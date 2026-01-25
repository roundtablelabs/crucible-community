export type ApiKnight = {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  prompt: string | null;
  model: string;
  stance?: string | null;
  temperature: number;
  origin: "official" | "workspace";
  author: { name: string };
  verified: boolean;
  websearch_enabled?: boolean;
};

