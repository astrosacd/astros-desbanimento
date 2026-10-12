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
- Client entrance uses real Supabase Auth with HttpOnly server cookies. Operational numbers are read from Baserow table 511, exclusively filtered by the server-verified, confirmed account email. Independently validate every returned row's ownership and return only client-visible fields. Keep BASEROW_API_TOKEN server-only. Number submissions are prepared directly through the Supabase astros-submit-number Edge Function and Baserow API. Name/email come from verified Supabase identity. Only new or EXCLUIDO numbers incur the configured fee; all other supported existing statuses resend free. Supabase service jobs enforce a unique request ID and block overlapping writes. Uncertain operations remain in review, never silently retried. Activation requires the submission SQL and ASTROS_BASEROW_WRITE_TOKEN in Supabase Edge Function secrets. No n8n or Google Sheets dependency. Brazil keeps local DDD+number; international numbers use +DDI with selected-country validation on client and Edge Function. New and EXCLUIDO renewals write only nacional/internacional in Baserow observacoes; free resends preserve existing observations. Do not add request markers to that field. Additional countries live in astros_custom_countries with authenticated read/admin-only CRUD RLS. Custom country IDs never authorize browser-supplied DDIs: the Edge Function must look up the current saved DDI before reservation. All standard-list DDIs and duplicate additional DDIs are forbidden for new/edited custom countries. Exclude the edited record itself from duplicate checks. Supabase enforces a unique custom DDI index and a check against the pinned standard DDI list; never delete existing country records automatically to install these constraints.
- The /admin area uses Supabase Auth on the server and painel_de_desbanimento.tipo_usuario keyed by authenticated UUID. Every administrative handler must call requireAdmin. Never authorize from localStorage or user-editable metadata.
- Legacy demo modules are unused by operational pages. Never reintroduce simulated records or balances into client routes.

- Route layouts and breadcrumb titles must follow the presented route matches (useMatches), never the requested location while navigation is pending. Public entrance/admin pages must never be rendered inside the client sidebar layout during login/logout transitions.
