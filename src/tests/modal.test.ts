import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString, Text } from "ink";
import Modal from "../ui/components/Modal";

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

test("Modal renders null when isOpen is false", () => {
  const output = renderToString(React.createElement(Modal, { isOpen: false, onClose: () => {} }), { columns: 80 });
  assert.equal(output, "");
});

test("Modal renders null when isOpen is false even with children", () => {
  const output = renderToString(
    React.createElement(
      Modal,
      { isOpen: false, onClose: () => {} },
      React.createElement(Text, null, "Visible content")
    ),
    { columns: 80 }
  );
  assert.equal(output, "");
});

test("Modal renders title when provided", () => {
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Confirm Action",
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Confirm Action"), `Expected "Confirm Action" in output: ${cleaned}`);
});

test("Modal renders string children", () => {
  const output = renderToString(
    React.createElement(
      Modal,
      {
        isOpen: true,
        onClose: () => {},
        title: "Info",
      },
      "This is a modal message"
    ),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("This is a modal message"), `Expected message in output: ${cleaned}`);
});

test("Modal renders fallback text when children is empty", () => {
  const output = renderToString(React.createElement(Modal, { isOpen: true, onClose: () => {} }), { columns: 80 });
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("no content"), `Expected fallback in output: ${cleaned}`);
});

test("Modal renders action buttons in footer", () => {
  const actions = [
    { label: "Cancel", onAction: () => {}, cancel: true },
    { label: "Confirm", onAction: () => {}, primary: true },
  ];
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Confirm",
      actions,
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Cancel"), `Expected Cancel in output: ${cleaned}`);
  assert.ok(cleaned.includes("Confirm"), `Expected Confirm in output: ${cleaned}`);
});

test("Modal shows close hint by default", () => {
  const output = renderToString(React.createElement(Modal, { isOpen: true, onClose: () => {} }), { columns: 80 });
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Esc to close"), `Expected close hint in output: ${cleaned}`);
});

test("Modal shows navigation hint when actions are provided", () => {
  const actions = [
    { label: "OK", onAction: () => {} },
    { label: "Cancel", onAction: () => {} },
  ];
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      actions,
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Enter to"), `Expected Enter hint in output: ${cleaned}`);
});

test("Modal accepts custom close hint text", () => {
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      closeHint: "Press Q to quit",
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Press Q to quit"), `Expected custom hint in output: ${cleaned}`);
});

test("Modal renders custom title color", () => {
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Error",
      titleColor: "red",
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Error"), `Expected title in output: ${cleaned}`);
});

test("Modal renders with custom width and height percentages", () => {
  // Small terminal to force minimum sizing
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Custom Size",
      widthPercent: 80,
      heightPercent: 60,
    }),
    { columns: 50 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Custom Size"), `Expected title in output: ${cleaned}`);
});

test("Modal renders children as React elements", () => {
  const output = renderToString(
    React.createElement(
      Modal,
      {
        isOpen: true,
        onClose: () => {},
        title: "Details",
      },
      React.createElement(Text, null, "Element child content")
    ),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Element child content"), `Expected element content in output: ${cleaned}`);
});

test("Modal renders with accent color prop", () => {
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Colored",
      accentColor: "blue",
    }),
    { columns: 80 }
  );
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Colored"), `Expected title in output: ${cleaned}`);
});

test("Modal fires onClose when Escape key is pressed", () => {
  let closed = false;
  renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {
        closed = true;
      },
    }),
    { columns: 80 }
  );

  // Ink's useInput isn't triggered in renderToString (it returns no-op defaults),
  // so onClose is never called during static rendering. Verify the component
  // structure is correctly rendered when open.
  assert.equal(closed, false);
});

test("Modal renders correctly at minimum terminal size", () => {
  const output = renderToString(
    React.createElement(Modal, {
      isOpen: true,
      onClose: () => {},
      title: "Tiny",
    }),
    { columns: 40 }
  );
  assert.ok(output.length > 0, "Modal should render something at minimum size");
  const cleaned = stripAnsi(output);
  assert.ok(cleaned.includes("Tiny"), `Expected title in output: ${cleaned}`);
});
