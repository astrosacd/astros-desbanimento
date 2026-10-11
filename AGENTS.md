<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Keep V2 exclusively frontend-demo: pure rules in the demo model, shared provider for hydrated local persistence, and independent TanStack content routes; this prevents real service calls and centralizes simulation invariants.
- Store currency as integer cents and derive indicators from demo records/movements; this avoids rounding errors and inconsistent dashboard totals.
- Authentication screens validate only transient form state and never persist passwords or assert authenticated sessions; no backend exists in this demo.
