# Matrix-Lab

## 1. Project overview

**Matrix-Lab** is an interactive web application for exploring matrix
transformations visually. Users create a 2D mathematical scene
containing geometric objects and mathematical fields, then apply an
ordered sequence of transformation matrices to the scene.

The initial release is 2D, but the architecture should leave room for 3D
transformations and broader mathematical visualization.

A key product principle is that **vector fields are a first-class MVP
feature**, not a later enhancement. Users should be able to see both
geometric objects and vector fields before and after transformations
from the first usable release.

## 2. Product goals

1.  Make 2D matrix transformations intuitive through interactive
    visualization.
2.  Apply transformations consistently to points, vectors, shapes,
    curves, and vector fields.
3.  Make transformation order explicit and easy to experiment with.
4.  Show the relationship between the visual result and the underlying
    mathematics.
5.  Keep the mathematical model independent of the rendering library.
6.  Establish a 2D-first architecture that can grow into 3D.

## 3. Main user experience

The main workspace should have three areas.

### Visualization canvas

-   2D Cartesian coordinate plane with axes, grid, origin, and labels.
-   Zoom and pan.
-   Original and transformed geometry.
-   Optional basis-vector display.
-   Vector-field arrows with configurable sampling and appearance.
-   Clear visual distinction between original and transformed results.

### Scene objects panel

Users can add, edit, hide/show, duplicate, and remove objects.

Initial supported object types:

-   Point
-   Vector
-   Line or line segment
-   Rectangle or polygon
-   Circle
-   Function or parametric curve
-   Vector field

Vector fields must be supported in the initial MVP alongside geometric
objects.

### Transformation pipeline

-   Ordered list of transformation steps.
-   Each step contains a matrix and optional descriptive label/type.
-   Add, edit, duplicate, remove, reorder, and enable/disable steps.
-   Apply the enabled transformations to the entire scene.
-   Display the composite matrix.
-   Provide a step-through mode showing the result after each step.

## 4. Scene and object model

The application owns the mathematical scene model. Do not store
JSXGraph-specific objects as the source of truth.

Each scene object should have: - Stable ID. - Object type. -
Mathematical parameters or geometry. - Presentation properties such as
colour, stroke, fill, and visibility. - Optional user-defined label.

Examples:

-   Point: mathematical coordinates `(x, y)`.
-   Vector: components or start and end points.
-   Rectangle/polygon: vertices or a well-defined geometric
    parameterization.
-   Circle: centre and radius.
-   Function curve: expression and domain, subject to the supported
    expression model.
-   Vector field: vector-valued function of position plus sampling and
    display configuration.

### Geometric objects versus fields

Keep geometric objects and mathematical fields conceptually distinct:

``` text
Scene
├── Geometric objects
│   ├── Point
│   ├── Vector
│   ├── Line
│   ├── Polygon / Rectangle
│   ├── Circle
│   └── Curve
└── Fields
    ├── Vector field
    └── (Future) Scalar field
```

A vector field must **not** be stored as thousands of independent
arrows. Store its defining function and sampling configuration. Generate
sample positions and arrow vectors during scene evaluation or rendering.

This keeps the field editable, scalable, and mathematically meaningful.

## 5. Transformation model and conventions

Use one explicit convention throughout the mathematical engine:

-   Column vectors.
-   A point/vector is multiplied on the left by a matrix: `v' = A * v`.
-   Matrix multiplication order is documented and tested.
-   Matrix storage layout is documented.
-   Convert conventions explicitly at the JSXGraph boundary if required.

### Initial 2D linear transformations

Start with 2×2 matrices:

``` text
[ a  b ]
[ c  d ]
```

Support: - Arbitrary user-entered 2×2 matrices. - Rotation. - Scaling. -
Reflection. - Shearing. - Projection where supported by the chosen
representation.

For column vectors, if the user applies `R` first, then `S`, then `H`:

``` text
v' = H * S * R * v
```

The rightmost matrix acts first. The UI must make this ordering clear.

### Linear versus affine transformations

A 2×2 matrix represents a linear transformation and keeps the origin
fixed. Translation requires homogeneous coordinates, for example:

``` text
[ a  b  tx ]
[ c  d  ty ]
[ 0  0   1 ]
```

Plan the internal model so 3×3 homogeneous 2D transformations can be
added without confusing translation with an ordinary 2×2 linear
transformation. Translation may be implemented after the first 2D
linear-transform milestone if necessary.

### Preserve the original scene

Do not repeatedly mutate original object coordinates when users edit or
reorder transformations.

Instead:

1.  Preserve the original scene definition.
2.  Evaluate the enabled transformation steps in order.
3.  Produce an evaluated/transformed scene.
4.  Render the original and transformed scenes as requested.

This avoids cumulative floating-point drift and makes pipeline editing
predictable.

## 6. Vector fields --- required in the MVP

Vector fields are a central feature of Matrix-Lab and must be included
in the initial 2D release.

A vector field assigns a vector to each point in a region:

``` text
F(x, y) = (P(x, y), Q(x, y))
```

Initial preset fields should include:

``` text
Radial:     F(x, y) = (x, y)
Rotational: F(x, y) = (-y, x)
Saddle:     F(x, y) = (x, -y)
Constant:   F(x, y) = (1, 0)
```

Users should be able to define a custom field using supported
expressions for its two components.

### Vector-field controls

-   Select a preset or define a custom field.
-   Set the visible sampling region.
-   Configure sampling density/grid spacing.
-   Configure arrow scale and visual style.
-   Show/hide the field.
-   Compare original and transformed fields.
-   Apply the same transformation pipeline used by other scene objects.

Do not create an excessively dense field by default. Provide sensible
sampling defaults and controls to keep the visualization readable and
responsive.

### Important mathematical distinction

The application must distinguish between two operations that are related
but not equivalent.

**A. Transform the vector values at fixed sample coordinates**

For a linear map `A`:

``` text
G(x) = A * F(x)
```

The arrows change direction and/or magnitude, but their sample positions
remain fixed.

**B. Transform the vector field geometrically**

For an invertible coordinate transformation `x' = A * x`, the
pushforward field is:

``` text
F'(x') = A * F(A^-1 * x')
```

Both positions and vector values are transformed. This is the natural
transformation of a vector field under the coordinate map.

The UI should make the selected interpretation explicit. Do not label
both behaviours simply as "transform field" without explaining the
distinction.

For singular matrices, the geometric pushforward formula involving
`A^-1` is unavailable. Handle this case explicitly rather than silently
substituting another interpretation.

For affine transformations, use the corresponding point-coordinate
mapping and its linear part for vector values. Translation moves sample
positions but does not itself change vector directions or magnitudes.

## 7. Original and transformed visualization modes

Provide:

-   **Original:** only the untransformed scene.
-   **Overlay:** original and transformed scenes together, with distinct
    styles.
-   **Transformed:** only the transformed scene.
-   **Step-through:** scene after each transformation step.

These modes should work for geometric objects and vector fields. Users
should also be able to toggle individual objects and transformation
steps.

## 8. Mathematical learning features

These features should follow the core scene and transformation workflow,
but the architecture should not prevent them.

### Basis vectors

Display:

``` text
e1 = [1, 0]
e2 = [0, 1]
```

Show where the standard basis vectors move. Explain that, with
column-vector conventions, the columns of a 2×2 matrix are the
transformed standard basis vectors.

### Composite matrix

Display the composite matrix for enabled pipeline steps. Its
multiplication order must match the actual evaluation order.

### Matrix properties

Potential readouts: - Determinant: area scaling and orientation. - Rank:
dimension of the image. - Invertibility and inverse. - Eigenvalues and
eigenvectors, where meaningful. - Trace.

Explain results rather than displaying unexplained numbers. For example,
a zero determinant means a 2D linear map is singular and collapses the
plane into a lower-dimensional subspace.

## 9. Future mathematical capabilities

After the MVP, consider:

-   Scalar fields, including temperature/potential-style fields.
-   Contour plots and level sets.
-   More advanced function and parametric-curve support.
-   Vector-calculus concepts such as divergence, curl, and gradient.
-   Differential-equation and flow visualizations.
-   3D vector fields and surfaces.

These are future directions, not requirements for the first release.

## 10. Technical direction

### Proposed stack

-   Framework: Vue 3.
-   Language: TypeScript.
-   Build tooling: Vite.
-   2D renderer: JSXGraph.
-   Matrix/vector utilities: gl-matrix, if useful for the required
    operations.
-   Mathematical expression and numerical utilities: math.js, if needed.
-   Equation display: KaTeX.
-   UI component library: optional; select one only if it improves
    implementation speed and consistency.

Avoid dependencies without a concrete need. Keep the core mathematical
model small, explicit, and testable.

### JSXGraph's responsibility

JSXGraph is a rendering and interaction backend, not the source of truth
for mathematical state.

The application owns: - Scene objects and mathematical definitions. -
Transformation matrices and their order. - Coordinate conventions. -
Transformation evaluation. - Vector-field definitions and sampling
semantics. - Mathematical properties and validation.

JSXGraph receives evaluated geometry and renders it. JSXGraph-specific
objects should not leak into the domain model or mathematical engine.

### Suggested architecture

This is a conceptual starting point. Do not create every abstraction
before it is needed.

``` text
src/
  app/
    components/
    views/

  domain/
    scene/
      Scene.ts
      SceneObject.ts
      GeometricObject.ts
      VectorField.ts

    math/
      Vector2.ts
      Matrix2.ts
      Matrix3.ts
      Transform.ts

  engine/
    TransformationPipeline.ts
    SceneEvaluator.ts
    VectorFieldEvaluator.ts
    MatrixProperties.ts

  renderers/
    Renderer.ts
    JSXGraphRenderer.ts

  stores/
    sceneStore.ts
    transformationStore.ts
```

A possible renderer boundary:

``` typescript
interface Renderer {
  initialize(container: HTMLElement): void;
  render(scene: EvaluatedScene): void;
  clear(): void;
  destroy(): void;
}
```

Adapt the interface to JSXGraph's actual lifecycle and interaction
requirements. Keep mathematical evaluation outside the renderer.

## 11. Coordinate systems

Keep these coordinate spaces separate:

1.  **World coordinates:** original mathematical scene.
2.  **Transformed/world coordinates:** result of the transformation
    pipeline.
3.  **Screen coordinates:** pixel positions used by the renderer.

The renderer maps world coordinates to screen coordinates. Zoom and pan
affect the view, not the mathematical object definitions.

Use one documented matrix convention throughout the math engine. Convert
explicitly at the JSXGraph boundary if its conventions differ.

## 12. Development phases

Vector fields are part of Phase 1. The phases below are intended to
build incrementally, not postpone vector fields until advanced
mathematics work.

### Phase 1 --- 2D scene and visualization foundation

-   Create Vue 3 + TypeScript application.
-   Integrate JSXGraph.
-   Implement coordinate plane, axes, grid, zoom, and pan.
-   Define the scene model and mathematical coordinate conventions.
-   Add points, vectors, lines, rectangles/polygons, and circles.
-   Add vector-field definitions and presets.
-   Render vector fields using configurable sampling.
-   Establish original versus evaluated scene rendering.

**Success criterion:** A user can create geometric objects and a vector
field, and see them rendered correctly in a 2D coordinate plane.

### Phase 2 --- Transformation pipeline for the whole scene

-   Implement and test 2×2 matrix operations.
-   Add manual matrix entry.
-   Add rotation, scaling, reflection, and shear presets.
-   Add multiple ordered transformation steps.
-   Support editing, reordering, enabling/disabling, duplication, and
    deletion.
-   Apply transformations to every supported geometric object.
-   Support both vector-field transformation interpretations:
    -   Transform vector values at fixed sample coordinates.
    -   Geometrically transform the field using the appropriate
        pushforward.
-   Show original, overlay, and transformed views for both geometry and
    fields.
-   Display the composite matrix.
-   Add step-through visualization.

**Success criterion:** A user can define a scene containing shapes,
vectors, and a vector field, apply a sequence of matrices, and compare
the original and transformed results correctly.

### Phase 3 --- Mathematical exploration

-   Basis-vector visualization.
-   Determinant, rank, inverse, and invertibility.
-   Eigenvalue/eigenvector exploration where appropriate.
-   Function and parametric curves.
-   Improved custom vector-field expression support.
-   Educational experiment presets.

### Phase 4 --- Homogeneous and affine transformations

-   Introduce 3×3 homogeneous coordinates for 2D.
-   Add translation.
-   Explain linear versus affine transformations.
-   Verify composition and inverse behaviour.
-   Ensure vector-field positions and vector values follow the correct
    affine rules.

### Phase 5 --- Further visualization and 3D

-   Consider scalar fields, contours, divergence, curl, and gradient.
-   Evaluate JSXGraph 3D versus Three.js.
-   Add 3D coordinate axes, vectors, points, and basic shapes.
-   Support 4×4 homogeneous transformations.
-   Add camera controls and perspective.
-   Extend vector-field visualization to 3D if performance and usability
    permit.

## 13. Educational experiment ideas

-   What happens when the determinant is zero?
-   What happens when a transformation reverses orientation?
-   Why does changing transformation order change the result?
-   What do the columns of a matrix represent geometrically?
-   What happens when a transformation is followed by its inverse?
-   Which directions remain unchanged under a transformation?
-   How does a radial field change under scaling?
-   How does a rotational field change under reflection?
-   What is the difference between transforming vector values and
    transforming the entire field?

## 14. Non-functional requirements

-   Mathematical operations must be unit-testable without a browser or
    renderer.
-   Rendering should update efficiently when scene or pipeline state
    changes.
-   Invalid matrix and expression input must be handled clearly.
-   Singular matrices must be supported where the operation is valid;
    operations requiring an inverse must explain when no inverse exists.
-   Consider floating-point precision and numerical stability.
-   Vector-field sampling must be configurable and performant.
-   The UI should work on common desktop screen sizes.
-   Avoid unnecessary complexity and premature generalization.

## 15. Out of scope for the initial MVP

-   Full symbolic algebra or a computer algebra system.
-   General-purpose CAD or drawing functionality.
-   Production-grade 3D modelling.
-   Differential-equation solvers.
-   Collaboration, accounts, cloud storage, or a backend unless a later
    requirement justifies them.

## 16. Guidance for AI planning

Before implementation, produce a practical phased plan that:

1.  Identifies the smallest useful MVP while retaining vector fields in
    Phase 1.
2.  Breaks work into incremental, testable tasks.
3.  Proposes domain types and mathematical conventions.
4.  Defines transformation order and matrix representation precisely.
5.  Defines both vector-field transformation semantics and how singular
    matrices are handled.
6.  Identifies the JSXGraph integration boundary.
7.  Includes unit tests for matrix operations, composition order,
    geometry transformations, and vector-field transformations.
8.  Identifies risks, especially coordinate conventions, sampling
    performance, and linear versus affine transformations.
9.  Avoids implementing future 3D and advanced mathematics before the 2D
    foundation is reliable.

Prefer small, demonstrable milestones over a large initial
implementation. Do not remove vector fields from the MVP when
simplifying scope; simplify their first implementation instead (for
example, start with preset fields and a basic configurable sampling
grid).
