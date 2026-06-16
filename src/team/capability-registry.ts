import type { Capability } from "./capability";
import { CoreSoftwareEngineeringCapability } from "./capabilities/core-software-engineering";
import type { ExecutionContext } from "../common/execution-context";

export class CapabilityRegistry {
  private capabilities: Capability[] = [];

  constructor() {
    this.register(new CoreSoftwareEngineeringCapability());
    // Future capabilities can be registered here or injected dynamically
  }

  public register(capability: Capability) {
    this.capabilities.push(capability);
    // Sort by precedence ascending (lower precedence runs first, but higher precedence overrides in logic when applied)
    this.capabilities.sort((a, b) => a.precedence - b.precedence);
  }

  public getActiveCapabilities(context: ExecutionContext): Capability[] {
    return this.capabilities.filter((cap) => cap.shouldActivate(context));
  }

  public buildPrompt(context: ExecutionContext): string {
    const active = this.getActiveCapabilities(context);
    const blocks = active.map((cap) => {
      return `<capability id="${cap.id}">\n${cap.onPromptBuild(context)}\n</capability>`;
    });

    if (blocks.length === 0) return "";
    return `Use the following capabilities and guidelines to assist the user:\n\n${blocks.join("\n\n")}`;
  }

  public getDeniedTools(context: ExecutionContext): string[] {
    const active = this.getActiveCapabilities(context);
    const denied = new Set<string>();
    for (const cap of active) {
      cap.deniedTools().forEach((t) => denied.add(t));
    }
    return Array.from(denied);
  }

  public getAllowedTools(context: ExecutionContext): string[] {
    const active = this.getActiveCapabilities(context);
    const allowed = new Set<string>();
    for (const cap of active) {
      cap.allowedTools().forEach((t) => allowed.add(t));
    }
    return Array.from(allowed);
  }
}

export const globalCapabilityRegistry = new CapabilityRegistry();
