import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Calendar, Languages, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/locale";
import { renderMarkdown } from "@/pages/BlogPost";

const fmt = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); } catch { return iso; } };

export const CityPostCard = ({ p, citySlug }) => (
  <Link to={`/join/${citySlug}/blog/${p.slug}`} className="group block border border-neutral-200 hover:border-black p-5 transition-colors" data-testid={`city-post-${p.slug}`}>
    <div className="text-xs font-mono text-neutral-500 flex items-center gap-1.5"><Calendar className="w-3 h-3" />{fmt(p.created_at)}</div>
    <div className="font-display font-bold text-lg mt-2 leading-snug" data-no-i18n="true">{p.title}</div>
    <p className="text-sm text-neutral-600 mt-2 line-clamp-3" data-no-i18n="true">{p.excerpt}</p>
    <div className="text-xs font-mono mt-3 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">Read <ArrowRight className="w-3 h-3" /></div>
  </Link>
);

export const CityBlogTeaser = ({ citySlug, cityName }) => {
  const [posts, setPosts] = useState([]);
  useEffect(() => { api.get(`/city-blog/city/${citySlug}?limit=3`).then((r) => setPosts(r.data || [])).catch(() => {}); }, [citySlug]);
  if (!posts.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12" data-testid="city-blog-teaser">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-2xl font-bold">Hiring news from {cityName}</h2>
        <Link to={`/join/${citySlug}/blog`} className="text-sm font-mono hover:underline" data-testid="city-blog-all">All posts →</Link>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">{posts.map((p) => <CityPostCard key={p.slug} p={p} citySlug={citySlug} />)}</div>
    </section>
  );
};

export function CityBlogList() {
  const { slug } = useParams();
  const [posts, setPosts] = useState(null);
  useEffect(() => { api.get(`/city-blog/city/${slug}?limit=60`).then((r) => setPosts(r.data || [])).catch(() => setPosts([])); }, [slug]);
  const city = posts?.[0]?.city || slug;
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 min-h-screen" data-testid="city-blog-list">
      <Helmet><title>{`Lumo hiring news — ${city}`}</title></Helmet>
      <Link to={`/join/${slug}`} className="text-xs font-mono text-neutral-500 hover:underline flex items-center gap-1" data-testid="city-blog-back"><ArrowLeft className="w-3 h-3" /> Back to {city}</Link>
      <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-3">Hiring news: {city}</h1>
      {!posts && <div className="mt-8 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
      {posts && posts.length === 0 && <p className="mt-8 text-neutral-500" data-testid="city-blog-empty">No posts yet. Check back tomorrow.</p>}
      <div className="grid sm:grid-cols-2 gap-3 mt-8">{(posts || []).map((p) => <CityPostCard key={p.slug} p={p} citySlug={slug} />)}</div>
    </div>
  );
}

export function CityBlogPost() {
  const { slug, postSlug } = useParams();
  const [params, setParams] = useSearchParams();
  const [post, setPost] = useState(null);
  const [missing, setMissing] = useState(false);
  const { setPageLang } = useLocale();
  const en = params.get("lang") === "en";

  useEffect(() => {
    api.get(`/city-blog/post/${postSlug}`).then((r) => setPost(r.data)).catch(() => setMissing(true));
  }, [postSlug]);
  useEffect(() => {
    if (!post) return undefined;
    setPageLang(en ? "en" : post.lang);
    return () => setPageLang(null);
  }, [post, en, setPageLang]);

  if (missing) return <div className="p-24 text-center" data-testid="city-blog-post-missing">Post not found. <Link to={`/join/${slug}`} className="underline">Back to city</Link></div>;
  if (!post) return <div className="p-24 text-center text-neutral-500"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  const hasLocal = post.lang !== "en" && post.body_md && post.body_md !== post.body_md_en;
  const title = en || !hasLocal ? post.title_en || post.title : post.title;
  const body = en || !hasLocal ? post.body_md_en || post.body_md : post.body_md;
  const apply = `/register?role=provider&recruit_city_slug=${encodeURIComponent(slug)}`;

  return (
    <article className="max-w-3xl mx-auto px-6 py-12 min-h-screen" data-testid="city-blog-post">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={en ? post.excerpt_en : post.excerpt} />
        <link rel="canonical" href={`https://golumo.app/join/${slug}/blog/${postSlug}${en ? "?lang=en" : ""}`} />
      </Helmet>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to={`/join/${slug}/blog`} className="text-xs font-mono text-neutral-500 hover:underline flex items-center gap-1" data-testid="city-blog-post-back"><ArrowLeft className="w-3 h-3" /> {post.city} hiring news</Link>
        {hasLocal && (
          <button
            onClick={() => setParams(en ? {} : { lang: "en" })}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 hover:border-black px-3 py-1 text-xs transition-colors"
            data-testid="city-blog-lang-toggle" data-no-i18n="true"
          >
            <Languages className="w-3.5 h-3.5" /> {en ? "Read in local language" : "Read in English"}
          </button>
        )}
      </div>
      <div className="text-xs font-mono text-neutral-500 mt-6">{fmt(post.created_at)}</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2 leading-[1.05]" data-no-i18n="true" data-testid="city-blog-post-title">{title}</h1>
      {post.hero_image && <img src={post.hero_image} alt={post.city} className="w-full aspect-[16/9] object-cover mt-8" />}
      <div className="mt-6" data-no-i18n="true" data-testid="city-blog-post-body">{renderMarkdown(body)}</div>
      <div className="mt-10 border border-black p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="font-display text-xl font-bold">Ready to work in {post.city}?</div>
        <Link to={apply} className="btn-lumo btn-lumo-primary" data-testid="city-blog-post-apply">Apply now <ArrowRight className="w-4 h-4" /></Link>
      </div>
    </article>
  );
}
