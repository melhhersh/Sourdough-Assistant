import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { UIMessage } from "ai";

function makeToolPart(
  type: string,
  state: string,
  output: Record<string, unknown>
) {
  return { type, state, output };
}

function makeMsg(parts: ReturnType<typeof makeToolPart>[]): UIMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    parts: parts as UIMessage["parts"],
  };
}

describe("Sidebar — empty state", () => {
  it("shows placeholder when no messages", () => {
    render(<Sidebar messages={[]} />);
    expect(screen.getByText(/symptoms and recipe progress/i)).toBeInTheDocument();
  });

  it("renders Session Context header", () => {
    render(<Sidebar messages={[]} />);
    expect(screen.getByText(/session context/i)).toBeInTheDocument();
  });
});

describe("Sidebar — symptom extraction", () => {
  it("displays a recorded symptom", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordSymptom", "output-available", {
          symptom: "gummy crumb",
          severity: "moderate",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText("gummy crumb")).toBeInTheDocument();
    expect(screen.getByText("moderate")).toBeInTheDocument();
  });

  it("displays multiple symptoms", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordSymptom", "output-available", {
          symptom: "dense crumb",
          severity: "high",
        }),
        makeToolPart("tool-recordSymptom", "output-available", {
          symptom: "pale crust",
          severity: "low",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText("dense crumb")).toBeInTheDocument();
    expect(screen.getByText("pale crust")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
  });

  it("ignores tool parts with wrong state", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordSymptom", "pending", {
          symptom: "should not show",
          severity: "low",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
    expect(screen.getByText(/symptoms and recipe progress/i)).toBeInTheDocument();
  });

  it("ignores non-symptom tool parts", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-lookupKnowledge", "output-available", {
          symptom: "should not show",
          severity: "high",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
  });

  it("hides placeholder when symptoms are present", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordSymptom", "output-available", {
          symptom: "flat loaf",
          severity: "high",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.queryByText(/symptoms and recipe progress/i)).not.toBeInTheDocument();
  });
});

describe("Sidebar — recipe step extraction", () => {
  it("displays recipe progress when a step is recorded", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordRecipeStep", "output-available", {
          recipeId: "classic-country-sourdough",
          stepNumber: 2,
          stepTitle: "Autolyse",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText("classic-country-sourdough")).toBeInTheDocument();
    expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    expect(screen.getByText("Autolyse")).toBeInTheDocument();
  });

  it("shows the latest step when multiple steps are recorded", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordRecipeStep", "output-available", {
          recipeId: "classic-country-sourdough",
          stepNumber: 1,
          stepTitle: "Mix",
        }),
        makeToolPart("tool-recordRecipeStep", "output-available", {
          recipeId: "classic-country-sourdough",
          stepNumber: 3,
          stepTitle: "Shape",
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText(/step 3/i)).toBeInTheDocument();
    expect(screen.getByText("Shape")).toBeInTheDocument();
    expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument();
  });

  it("renders recipe step without optional stepTitle", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordRecipeStep", "output-available", {
          recipeId: "sourdough-pancakes",
          stepNumber: 1,
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText("sourdough-pancakes")).toBeInTheDocument();
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
  });

  it("ignores recipe step parts with wrong state", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordRecipeStep", "input-available", {
          recipeId: "classic-country-sourdough",
          stepNumber: 1,
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.queryByText("classic-country-sourdough")).not.toBeInTheDocument();
  });
});

describe("Sidebar — combined symptoms and recipe", () => {
  it("shows both symptoms and recipe progress simultaneously", () => {
    const messages = [
      makeMsg([
        makeToolPart("tool-recordSymptom", "output-available", {
          symptom: "flat loaf",
          severity: "high",
        }),
        makeToolPart("tool-recordRecipeStep", "output-available", {
          recipeId: "classic-country-sourdough",
          stepNumber: 2,
        }),
      ]),
    ];
    render(<Sidebar messages={messages} />);
    expect(screen.getByText("flat loaf")).toBeInTheDocument();
    expect(screen.getByText("classic-country-sourdough")).toBeInTheDocument();
    expect(screen.getByText(/recipe progress/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded symptoms/i)).toBeInTheDocument();
  });
});
