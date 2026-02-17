import React, { useEffect, useState } from 'react';
import type { CircuitComponent } from '../types';
import './ImageOverlay.css';

interface ImageOverlayProps {
	imageFile: File | null;
	warpedImageBase64?: string | null;
	components: CircuitComponent[];
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
	imageFile,
	warpedImageBase64,
	components
}) => {
	const [displaySrc, setDisplaySrc] = useState<string | null>(null);
	const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

	// Decide what image to show
	useEffect(() => {
		if (warpedImageBase64) {
			// Backend returned the straightened image -> Perfect alignment!
			setDisplaySrc(`data:image/jpeg;base64,${warpedImageBase64}`);
		} else if (imageFile) {
			// Fallback to original upload (Might be skewed, but better than nothing)
			const url = URL.createObjectURL(imageFile);
			setDisplaySrc(url);
			return () => URL.revokeObjectURL(url);
		}
	}, [imageFile, warpedImageBase64]);

	const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		setNaturalSize({
			width: e.currentTarget.naturalWidth,
			height: e.currentTarget.naturalHeight
		});
	};

	if (!displaySrc) return null;

	// Helper to convert [[x,y],...] to SVG points string "x,y x,y ..."
	const getPoints = (box: number[][]) => {
		return box.map(p => `${p[0]},${p[1]}`).join(' ');
	};

	return (
		<div className="image-overlay-container">
			<img
				src={displaySrc}
				alt="Circuit Analysis"
				className="display-image"
				onLoad={onImgLoad}
			/>

			{naturalSize.width > 0 && (
				<svg
					className="overlay-svg"
					viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
					preserveAspectRatio="none"
				>
					{components.map((comp) => (
						comp.box && (
							<polygon
								key={comp.id}
								points={getPoints(comp.box)}
								className="component-box"
							>
								<title>{comp.name} ({comp.type})</title>
							</polygon>
						)
					))}
				</svg>
			)}
		</div>
	);
};
