// Chart colour tokens. Canvas cannot read css custom properties, so the
// values chart.js needs live here; the greys are the ones app.css gives the
// rest of the site. The charts sit on the site's white cards and the site has
// the one, light theme, so there is the one palette.
//
// Every chart plots a single series, so every bar wears the same hue: a teal
// of the site's own family, but more saturated than its nord teals, which
// read as grey once they fill a bar. It was checked rather than picked by
// eye — lightness inside the band, chroma above the floor, and 4.3:1 against
// the white it sits on.
export const PALETTE = {
	surface: '#ffffff',
	gridline: '#edf2f7', // gray-200
	axis: '#cbd5e0', // gray-400
	textPrimary: '#1a202c', // gray-900
	textSecondary: '#4a5568', // gray-700
	muted: '#68778c', // gray-500
	accent: '#00897b',
	accentHover: '#00695c',
	// the months other than the one on show: context rather than the subject,
	// each with its number written on it, since the grey alone is faint
	context: '#a0aec0',
	contextHover: '#718096'
};
