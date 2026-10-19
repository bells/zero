## Purpose

Let macOS Zero Snap users revise one existing annotation through selection, geometry, properties and text editing, with deterministic input priority, cancellation and one history entry per completed operation.

## ADDED Requirements

### Requirement: Drawing and object selection remain distinct modes
Finishing an annotation SHALL keep its drawing tool active for continuous drawing and show that tool's defaults. The user SHALL switch to Select to target existing annotations. A Select click SHALL choose the topmost annotation whose selectable bounds contain the point; empty space SHALL clear object selection without adding annotation history. Selection chrome SHALL reflect a single selected object only. Starting a drawing tool SHALL leave object editing and use tool defaults.

#### Scenario: User draws several rectangles
- **WHEN** the user finishes one rectangle and starts another without changing tools
- **THEN** Rectangle remains active and the next rectangle uses Rectangle defaults rather than entering object dragging

#### Scenario: Annotations overlap
- **WHEN** Select clicks within the selectable bounds of multiple annotations
- **THEN** only the most recently drawn matching annotation is selected, without changing z-order

#### Scenario: Empty space is clicked
- **WHEN** Select clicks empty space without dragging
- **THEN** the selected object clears without changing annotation history or crop geometry

### Requirement: Single objects support type-appropriate geometry editing
The selected annotation SHALL be movable by dragging. Rectangle, Ellipse and Mosaic SHALL have edge/corner resize handles; Arrow SHALL expose independently draggable endpoints; Pen SHALL move or scale as a whole through its bounding box without editing individual path nodes; Text SHALL move and change size through font size, without stretch handles. Rectangle radius SHALL remain bounded after resize. Geometry operations SHALL use source pixels, preserve object identity, style and z-order, constrain geometry anchors to captured image bounds, and allow crop clipping instead of forcing objects into the crop. Overflowing strokes and oversized text SHALL be clipped at image edges without silently reducing font size. Resize SHALL prevent inverted or invalid dimensions; degenerate Pen axes SHALL not produce non-finite coordinates. Multi-selection, grouping and rotation SHALL remain outside this capability.

#### Scenario: Shape is moved or resized
- **WHEN** the user drags a selected shape or one of its handles
- **THEN** only that object's geometry previews and commits, its style and identity remain stable, and the crop does not move

#### Scenario: Arrow endpoint is dragged
- **WHEN** the user drags one selected arrow endpoint
- **THEN** only that endpoint moves, its direction and length update, and the opposite endpoint stays fixed

#### Scenario: Pen is scaled
- **WHEN** the selected Pen bounding box changes
- **THEN** all points transform together, stroke width remains its configured source-pixel value and no individual-node controls appear

#### Scenario: Geometry reaches an invalid limit
- **WHEN** a transform reaches the image edge, crosses a minimum-size limit or scales a horizontal or vertical Pen
- **THEN** it clamps to valid finite geometry without flipping, disappearing or moving the screenshot selection

### Requirement: Annotation gestures preserve crop interaction priorities
Property controls and resize handles SHALL take precedence over annotation objects, annotation objects over crop-interior dragging, and crop-interior dragging over outside selection creation. Existing crop-resize controls SHALL remain available. Object handles SHALL be distinguishable from crop handles and excluded from output. Pointer capture SHALL retain the active edit until completion or cancellation; cancellation or lost pointer capture SHALL restore the object before the gesture without adding history. A drawing tool SHALL NOT reinterpret its drag as object or crop movement.

#### Scenario: Selected object and crop interior overlap
- **WHEN** a pointer drag starts on an annotation while Select is active
- **THEN** the annotation moves and the crop remains unchanged

#### Scenario: Empty crop interior is dragged
- **WHEN** Select starts a drag on annotation-free crop interior
- **THEN** object selection clears and the existing grab/grabbing crop translation behavior remains available

#### Scenario: Object gesture is cancelled
- **WHEN** a geometry gesture receives pointer cancellation or loses pointer capture
- **THEN** its original object returns, no undo entry is added and the session remains open

### Requirement: Text annotations support reversible multiline re-editing
In Select, double-clicking Text SHALL open a focused multiline editor initialized from that object's content and style. Enter SHALL insert a newline; Cmd+Enter or clicking outside SHALL commit; Escape SHALL cancel only that text edit. An existing object SHALL be replaced in place on commit, preserving ID, position, z-order and unmodified properties. An empty or whitespace-only committed value SHALL delete existing Text with undo support; a new empty text draft SHALL create no object. The editor SHALL support Chinese input composition without treating composition keystrokes as commit, delete, undo or capture cancellation.

#### Scenario: Existing text is edited
- **WHEN** the user double-clicks Text in Select, enters multiple lines and presses Cmd+Enter
- **THEN** one updated Text object replaces the original in the same position and z-order, with one undo entry

#### Scenario: Text edit is cancelled
- **WHEN** Escape is pressed during text editing outside active input composition
- **THEN** the draft is discarded, the original Text and its properties remain, and the object stays selected in the open session

#### Scenario: Existing text is emptied
- **WHEN** the user commits an empty existing Text draft
- **THEN** that object is removed and undo restores its previous content, style and geometry

#### Scenario: Input method confirms a candidate
- **WHEN** Enter is consumed to confirm a Chinese input candidate
- **THEN** that input does not commit the annotation or perform a capture-level command

### Requirement: Escape unwinds one editing layer at a time
Escape SHALL first be handled by the focused editable control or active text draft. Otherwise it SHALL cancel an active drawing, property or geometry transaction and restore its pre-edit state; when no edit is active it SHALL deselect a selected annotation; only when neither an edit nor object selection exists SHALL it cancel the screenshot session. One Escape MUST NOT cascade through multiple layers. Existing crop-geometry input cancellation and crop-drag rollback SHALL retain their priority.

#### Scenario: Escape during object movement
- **WHEN** Escape is pressed while a selected object is moving
- **THEN** movement rolls back, the object remains selected, and the session stays open

#### Scenario: Repeated Escape from object selection
- **WHEN** the user presses Escape with only an object selected and then presses Escape again
- **THEN** the first press deselects it and the second invokes the existing screenshot-session cancellation path

#### Scenario: Escape during crop dragging
- **WHEN** Escape is pressed during crop translation or resizing
- **THEN** the crop restores its pre-gesture geometry without also deselecting objects or closing capture

### Requirement: History records completed edits rather than preview events
Object property changes, movement, resizing, endpoint changes, text replacement and deletion SHALL each produce one undo entry per completed operation. Slider/pointer updates SHALL preview without creating intermediate history entries; a slider interaction ends on pointer release or keyboard-focus completion, while numeric edits commit on Enter, Tab or blur. Cancelled, invalid and no-op edits SHALL add no entry or discard an existing redo branch. A genuine new edit after undo SHALL clear redo. Selecting objects, changing tool defaults and moving the crop SHALL NOT add annotation history. During text-input focus native input undo SHALL take precedence over scene history.

#### Scenario: Slider generates many updates
- **WHEN** the user drags selected-object opacity through many values and releases
- **THEN** one undo restores the original opacity and one redo restores the final opacity

#### Scenario: Cancelled or unchanged operation follows undo
- **WHEN** the user cancels an edit or finishes it with the same effective value after undoing a scene change
- **THEN** no history entry is created and the existing redo action remains available

#### Scenario: Completed edit follows undo
- **WHEN** the user commits a genuine new object change after undo
- **THEN** the abandoned redo branch clears and undo restores the state immediately before that edit

#### Scenario: Undo or delete receives input focus
- **WHEN** a text or property input owns the keyboard
- **THEN** its input editing behavior runs without deleting or undoing the selected scene object
