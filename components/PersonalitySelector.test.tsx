import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalitySelector, PERSONALITIES } from "./PersonalitySelector";

describe("PERSONALITIES data", () => {
  it("has exactly 5 personalities", () => {
    expect(PERSONALITIES).toHaveLength(5);
  });

  it("each personality has id, label, and tone", () => {
    for (const p of PERSONALITIES) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.tone).toBeTruthy();
    }
  });

  it("personality IDs are unique", () => {
    const ids = PERSONALITIES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes expected personality IDs", () => {
    const ids = PERSONALITIES.map((p) => p.id);
    expect(ids).toContain("sassy-mentor");
    expect(ids).toContain("french-chef");
    expect(ids).toContain("surfer-dude");
    expect(ids).toContain("drill-sergeant");
    expect(ids).toContain("grandma");
  });
});

describe("PersonalitySelector component", () => {
  it("renders all personality options", () => {
    render(<PersonalitySelector value="sassy-mentor" onChange={() => {}} />);
    for (const p of PERSONALITIES) {
      expect(screen.getByRole("option", { name: p.label })).toBeInTheDocument();
    }
  });

  it("shows the current selected value", () => {
    render(<PersonalitySelector value="french-chef" onChange={() => {}} />);
    const select = screen.getByRole("combobox");
    expect((select as HTMLSelectElement).value).toBe("french-chef");
  });

  it("calls onChange with the new value when selection changes", async () => {
    const onChange = vi.fn();
    render(<PersonalitySelector value="sassy-mentor" onChange={onChange} />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "surfer-dude");
    expect(onChange).toHaveBeenCalledWith("surfer-dude");
  });

  it("renders the Vibe label", () => {
    render(<PersonalitySelector value="grandma" onChange={() => {}} />);
    expect(screen.getByText("Vibe")).toBeInTheDocument();
  });
});
