type AnyNode = any;

function splitOnBraces(text: string): AnyNode[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const parts: AnyNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            parts.push({ type: "text", value: text.slice(last, match.index) });
        }
        parts.push({
            type: "envVar",
            data: {
                hName: "envvar",
                hProperties: { name: match[1] },
            },
            value: match[1],
            children: [{ type: "text", value: match[0] }],
        });
        last = match.index + match[0].length;
    }
    if (last < text.length) {
        parts.push({ type: "text", value: text.slice(last) });
    }
    return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

export function remarkEnvVars() {
    return (tree: AnyNode) => {
        function transform(node: AnyNode) {
            if (!node.children) return;
            const next: AnyNode[] = [];
            for (const child of node.children as AnyNode[]) {
                if (child.type === "text") {
                    const parts = splitOnBraces(child.value as string);
                    next.push(...parts);
                } else {
                    transform(child);
                    next.push(child);
                }
            }
            node.children = next;
        }
        transform(tree);
    };
}
