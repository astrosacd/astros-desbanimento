import type { ReactNode } from "react";
export function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="page-heading"><div className="min-w-0"><span className="page-heading-kicker">ASTROS / ÁREA DO CLIENTE</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>; }
