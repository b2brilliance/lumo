import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Loader2, Calendar } from "lucide-react";
import AdSense from "@/components/AdSense";

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); } catch { return iso; } };

// Minimal-but-safe markdown → HTML. We strip raw HTML and only render
// headings, bold/italic, lists, paragraphs, links, and code.
export function renderMarkdown(md = "") {
  // Strip raw HTML tags as a safety measure
  const safe = md.replace(/<\/?[^>]+(>|$)/g, "");
  const blocks = safe.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    if (/^###\s/.test(block)) return <h3 key={i} className="font-display text-xl font-black mt-8 mb-3">{block.replace(/^###\s/, "")}</h3>;
    if (/^##\s/.test(block))  return <h2 key={i} className="font-display text-2xl font-black mt-10 mb-3 tracking-tight">{block.replace(/^##\s/, "")}</h2>;
    if (/^#\s/.test(block))   return <h2 key={i} className="font-display text-3xl font-black mt-12 mb-4 tracking-tight">{block.replace(/^#\s/, "")}</h2>;
    if (/^([-*]\s)/m.test(block)) {
      const items = block.split(/\n/).filter((l) => /^[-*]\s/.test(l)).map((l) => l.replace(/^[-*]\s/, ""));
      return (
        <ul key={i} className="list-disc list-outside ml-5 my-4 space-y-1.5 text-slate-700">
          {items.map((it, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />)}
        </ul>
      );
    }
    if (/^>\s/.test(block)) {
      return <blockquote key={i} className="border-l-4 border-teal-700 pl-4 my-6 text-slate-700 italic">{block.replace(/^>\s/, "")}</blockquote>;
    }
    return <p key={i} className="leading-relaxed text-slate-700 my-4" dangerouslySetInnerHTML={{ __html: inline(block) }} />;
  });
}
function inline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-teal-700 underline">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 py-0.5 text-sm">$1</code>');
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/blog/${slug}`);
        setPost(data);
      } catch (e) {
        if (e.response?.status === 404) setNotFound(true);
      } finally { setLoading(false); }
    })();
  }, [slug]);

  // Update document title + meta description for browser tabs and JS-aware
  // crawlers (Googlebot renders JS, so this still helps for indexed pages).
  useEffect(() => {
    if (!post) return;
    const prevTitle = document.title;
    document.title = `${post.title} — Lumo blog`;
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content");
    const summary = (post.body_md || "").replace(/[#*`>_-]/g, "").slice(0, 160);
    if (metaDesc && summary) metaDesc.setAttribute("content", summary);
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc != null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [post]);

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (notFound) return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="blog-post-not-found">
      <h1 className="font-display text-4xl font-black tracking-tighter">Post not found.</h1>
      <Link to="/blog" className="inline-flex items-center gap-1 text-teal-700 hover:underline mt-4">
        <ArrowLeft className="w-4 h-4" /> Back to the blog
      </Link>
    </div>
  );
  if (!post) return null;

  return (
    <article className="min-h-screen bg-white" data-testid="blog-post-page">
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-16">
        <Link to="/blog" className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-teal-700 uppercase tracking-widest">
          <ArrowLeft className="w-3 h-3" /> Back to the blog
        </Link>

        <div className="overline text-teal-700 mt-6">{post.topic_label || "Article"}</div>
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2 leading-[1.05]">{post.title}</h1>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-500 uppercase tracking-widest mt-4">
          <Calendar className="w-3 h-3" /> {fmtDate(post.published_at)}
          <span className="text-slate-300">·</span>
          <span>by {post.author || "Lumo"}</span>
        </div>

        {post.hero_image_url && (
          <div className="my-8 aspect-[16/9] bg-slate-100 overflow-hidden">
            <img src={post.hero_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="prose prose-slate max-w-none text-base mt-4">
          {renderMarkdown(post.body_md || "")}
        </div>

        <AdSense testid="adsense-blog-post" />

        <div className="border-t border-slate-200 mt-12 pt-6">
          <div className="overline text-slate-500">Tags</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(post.tags || []).map((t) => (
              <span key={t} className="text-xs font-mono uppercase tracking-wider border border-slate-200 px-2 py-1 text-slate-600">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
