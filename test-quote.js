const prompt = `Hello "World" '
new line $VAR`;

// Simulate agent-worker.ts escaping
// Instead of replacing " with \" and using double quotes,
// replace ' with '"'"' and use single quotes.
const escapedPrompt = prompt.replace(/'/g, "'\"'\"'");
const command = `anng --worker -p '${escapedPrompt}'`;

// Simulate tmux-manager.ts escaping
const script = `clear; echo '=== Worker starting ==='; ${command}; exec $SHELL`;
const safeScript = `'${script.replace(/'/g, "'\"'\"'")}'`;

const cmd = `tmux split-window -t "test" -c "/tmp" ${safeScript}`;
console.log(cmd);
