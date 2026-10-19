# Whiteboard

Create one with **New design -> Whiteboard**, or open Whiteboard on the tool rail. You can enable its tools in the current design without losing its artwork. New boards start at 4,000 x 2,600 pixels. They use the existing local document, page, selection, undo and export system.

- **Notes and containers:** Add a sticky note or container, edit its text and color in Properties, and resize it with the handles. Objects fully inside a container move with it. Select a container before adding a note to start inside it. New cards find a free position and bring that area into view.
- **Photos:** The Photos button opens your existing uploads. Add, resize and crop photos with the normal editor controls.
- **Connect:** Drag from one object to another, or select two objects and choose Connect two selected objects. Drag an endpoint to detach or reconnect it. Attached ends follow movement and resizing, including grouped nodes. Drag the middle handle to set a bend. Reset bend restores automatic routing.
- **Connector appearance:** Properties controls the label, color, width, solid/dashed/dotted pattern, line shape, and arrow or dot markers. You can choose an attachment object and side explicitly. A conflicting route is orange and shows an explanation; move overlapping objects or reset the bend.
- **Draw:** Marker and Stroke eraser open the existing drawing tools with that tool selected. Pencil, highlighter, opacity, brand colors and brush size remain there. The stroke eraser removes touched freehand strokes; Undo restores the erase gesture.
- **Comments:** In Comments, add text to the selected object or choose Place comment on board and click an object or blank area. Pins open the associated comment. Resolve, reopen or delete it. These are local review notes, not a shared online conversation.
- **Navigation:** Select with Shift-click or a dragged selection area. Hold Space and drag to pan, or toggle Pan. Escape returns to selection. The normal zoom and Fit to screen controls work here.

Each page keeps its background and comments. Editable Forma JSON and workspace backups preserve the board. PNG, JPG, SVG and PDF exports include the artwork, line styles, labels and end markers; finished image and movie exports omit comment pins. Resize with Scale content also updates free endpoints, bends and comment positions on every page.

Boards are bounded canvases, with the editor's existing maximum of 8,000 pixels per side and 32 megapixels. A page supports up to 200 comments. Routing considers nearby obstacles and marks conflicts when it cannot find a clear route. This release does not add infinite canvases or live multi-user collaboration.

The repeatable browser check is `FORMA_TEST_URL=<isolated Vite URL> npm run test:whiteboard`. It exercises actual pointer handles, container movement, grouping and copying, two-page scaling, persistence, SVG export, marker erasing and pan. Test-only editor access is injected into that browser's source response and is absent from the packaged application.
