import * as React from "react";

/**
 * Splits a headline into words that rise in sequence. Text stays real text (one
 * accessible string for screen readers); only the visual spans are animated.
 */
export function MotionWords({ children, offset = 0 }: { children: React.ReactNode; offset?: number }) {
  let i = offset;
  const wrap = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === "string") {
      return node.split(/(\s+)/).map((part, k) =>
        /^\s+$/.test(part) || part === "" ? part : (
          <span key={`${i}-${k}`} className="cc-word" style={{ ["--cc-w" as string]: i++ }}>{part}</span>
        ),
      );
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      return React.cloneElement(node, undefined, wrap(node.props.children));
    }
    if (Array.isArray(node)) return node.map((n, k) => <React.Fragment key={k}>{wrap(n)}</React.Fragment>);
    return node;
  };
  return <>{wrap(children)}</>;
}
