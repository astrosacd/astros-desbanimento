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
- Keep client routes frontend-demo: pure rules in the demo model, shared provider for hydrated local persistence, and independent TanStack content routes; this prevents real service calls and centralizes simulation invariants.
- Store currency as integer cents and derive indicators from demo records/movements; this avoids rounding errors and inconsistent dashboard totals.
- Client authentication screens remain demo-only. The separately authorized /admin area uses Supabase Auth on the server, HttpOnly cookies, and painel_de_desbanimento.tipo_usuario keyed by the authenticated UUID. Every administrative server handler must call requireAdmin. Never authorize from localStorage, user-editable metadata or email alone.
