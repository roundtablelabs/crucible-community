type DraftKnight = {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  prompt: string;
  domains: string[];
  topicalFocusArea: string;
  primarySector: string;
  seniority: string;
};

type QualitySuggestion = {
  field: string;
  message: string;
  priority: "high" | "medium" | "low";
};

type QualityScore = {
  score: number;
  suggestions: QualitySuggestion[];
  completeness: {
    required: number;
    completed: number;
  };
};

export function calculateQualityScore(draft: DraftKnight): QualityScore {
  const suggestions: QualitySuggestion[] = [];
  let completed = 0;
  const required = 7;

  // Required fields
  if (!draft.name || draft.name.trim() === "") {
    suggestions.push({
      field: "Agent Name",
      message: "Agent name is required for publishing",
      priority: "high",
    });
  } else {
    completed++;
  }

  if (!draft.role || draft.role.trim() === "") {
    suggestions.push({
      field: "Role",
      message: "Role is required for publishing",
      priority: "high",
    });
  } else {
    completed++;
  }

  if (!draft.goal || draft.goal.trim() === "") {
    suggestions.push({
      field: "Goal/Mission",
      message: "Goal/Mission is required for publishing",
      priority: "high",
    });
  } else {
    completed++;
    // Check detail level
    if (draft.goal.length < 20) {
      suggestions.push({
        field: "Goal/Mission",
        message: "Consider adding more detail to your goal (at least 20 characters)",
        priority: "medium",
      });
    }
  }

  if (!draft.backstory || draft.backstory.trim() === "") {
    suggestions.push({
      field: "Backstory",
      message: "Backstory is required for publishing",
      priority: "high",
    });
  } else {
    completed++;
    // Check detail level
    if (draft.backstory.length < 50) {
      suggestions.push({
        field: "Backstory",
        message: "Consider adding more detail to your backstory (at least 50 characters)",
        priority: "medium",
      });
    }
  }

  if (!draft.prompt || draft.prompt.trim() === "") {
    suggestions.push({
      field: "Prompt",
      message: "Prompt is required for publishing",
      priority: "high",
    });
  } else {
    completed++;
    // Check detail level
    if (draft.prompt.length < 100) {
      suggestions.push({
        field: "Prompt",
        message: "Consider adding more detail to your prompt (at least 100 characters)",
        priority: "medium",
      });
    }
  }

  // Optional but recommended fields
  if (draft.domains.length === 0) {
    suggestions.push({
      field: "Domain Specialties",
      message: "Adding domain specialties helps users find your agent",
      priority: "medium",
    });
  } else {
    completed++;
    if (draft.domains.length < 3) {
      suggestions.push({
        field: "Domain Specialties",
        message: "Consider adding more domain specialties (3+ recommended)",
        priority: "low",
      });
    }
  }

  if (!draft.primarySector && !draft.topicalFocusArea) {
    suggestions.push({
      field: "Primary Sector",
      message: "Adding a primary sector helps categorize your agent",
      priority: "medium",
    });
  } else {
    completed++;
  }

  // Calculate score
  const baseScore = (completed / required) * 100;
  
  // Bonus points for detail
  let detailBonus = 0;
  if (draft.goal && draft.goal.length >= 50) detailBonus += 5;
  if (draft.backstory && draft.backstory.length >= 150) detailBonus += 5;
  if (draft.prompt && draft.prompt.length >= 200) detailBonus += 5;
  if (draft.domains.length >= 3) detailBonus += 5;

  const finalScore = Math.min(100, Math.round(baseScore + detailBonus));

  return {
    score: finalScore,
    suggestions: suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    completeness: {
      required,
      completed,
    },
  };
}

