// Plugin sandbox entry point (Phase 2: preview only).
// Opens the bundled UI and only handles a close message from it.
// No Figma variables or styles are created in this phase.
figma.showUI(__html__, { width: 900, height: 640, themeColors: true });

figma.ui.onmessage = (msg: { type: string }) => {
  if (msg && msg.type === "close") figma.closePlugin();
};
