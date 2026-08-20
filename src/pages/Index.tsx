import { useEffect, useState } from 'react';

const LINES = [
	'Building your website...',
	'💡 Tip: Press Enter to send, Shift+Enter for a new line',
	'💡 Tip: Drag and drop images into chat as references',
	'💡 Tip: Click on any file name in the chat to open it in Code',
	'💡 Tip: Toggle Plan Mode in the chat input for a step-by-step blueprint',
	'💡 Tip: Paste screenshots directly into chat with Cmd+V',
	'💡 Tip: Open Version History from the side panel to revert anytime',
	'💡 Tip: Click "Fix" on any error to send it to the AI automatically',
	'💡 Tip: Enable sound notifications in the logo menu',
	'💡 Tip: Add project instructions in Settings for persistent context',
];

const INTERVAL_MS = 5000;

export default function Index() {
	const [currentLine, setCurrentLine] = useState(0);
	const [columns, setColumns] = useState<number[]>([]);

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentLine((prev) => (prev + 1) % LINES.length);
		}, INTERVAL_MS);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		setColumns(
			Array(8)
				.fill(0)
				.map(() => Math.floor(Math.random() * 6)),
		);

		const interval = setInterval(() => {
			setColumns((prev) => prev.map((col) => (col + 1) % 8));
		}, 200);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="min-h-screen bg-[#FDFBF9] flex flex-col items-center justify-center overflow-hidden relative font-sans">
			<div className="grid grid-cols-8 gap-1 mb-6">
				{Array.from({ length: 48 }).map((_, i) => {
					const col = i % 8;
					const row = Math.floor(i / 8);
					const activeRow = columns[col];
					const distance = Math.abs(row - activeRow);
					const isActive = distance <= 2;
					const opacity = isActive ? 1 - distance * 0.3 : 0.1;

					return (
						<div
							key={i}
							className="w-1.5 h-1.5 transition-all duration-200"
							style={{
								backgroundColor: isActive && distance === 0 ? '#DFF803' : '#d4d4d4',
								opacity,
								transform: isActive && distance === 0 ? 'scale(1.3)' : 'scale(1)',
							}}
						/>
					);
				})}
			</div>
			<div className="text-[22px] text-[#282826] font-normal mb-1">Sticklight.</div>
			<p key={currentLine} className="text-sm font-semibold text-[#8a8a8a] animate-[fadeIn_0.4s_ease-in-out]">
				{LINES[currentLine]}
			</p>
			<style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
		</div>
	);
}
