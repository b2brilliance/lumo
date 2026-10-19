"""Top-27 metro Facebook campaign: one jobseeker + one small-business post per city, with local service photos."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

logger = logging.getLogger("lumo.city_ads")
CAMPAIGN = "top27_v1"
IMG = "https://static.prod-images.emergentagent.com/jobs/6c2ae84b-c1e9-4b02-ab0a-f5fa68ed9b27/images/"

# slug, post language, jobseeker photo, business photo
CITIES: List[tuple] = [
    ("tokyo-jp", "ja", "39692b1dd524daf0f43011c594a5d8013d2ba2baf1d998f30a8442c95a27b12c", "3c2c9e0a6061f4d596136a1328a03edc99070e77266bf6f270a819e714d1ffc9"),
    ("delhi-in", "hi", "5bd8351f89d34ec3e4796db33a989340c200f32afa9090515f1543650409e13b", "06c6374180cedc023d0266e1ad69262b38bcc92003b90f27916c45b22adcf2ed"),
    ("shanghai-cn", "zh", "a4f789a6f17434f7fca9243e43df444f196760dc74a4ce9a1b88c28e5c3e95e0", "c9c67eb2a80715bc09600a0932852096537298db80e6561f402d9c648c5b7dd2"),
    ("sao-paulo-br", "pt", "fb73978dc3eb8a232efe8f47856645d724bbb95542eed15bb397be584a0534d6", "f43dd77718ab109b102f277386411f24c2e22991124702f609d087a66b6e6ea0"),
    ("mexico-city-mx", "es", "2402a276e67f4692e1f80c436a11074b7c3f94184f13783ecbac770ff2a12a92", "af21ccd987bbe7179571f5cb3ef5180fc58fc48a1f162e37963929a3742735c1"),
    ("cairo-eg", "ar", "edaaeb9ca163e06b0416168e234af5482cb9c266d62d24be71a0cbd8f066ea69", "dcd405523de4b08e1baa6b98eb10f8dfd17e3ed43889e4a8f5de4dd3187facf2"),
    ("mumbai-in", "hi", "2a2f42c7f7d0adc4eb6ad299a0b7bb5a49f72ad73f7f35492754c592732ce1f7", "0285d00b26c5e944948e867a1f5fc5e49b1c2e918f9f500d34f1af3376492c24"),
    ("beijing-cn", "zh", "c74431e18185089aae5497c3332617c2aee68175cfcbf59b1e83c356d6db7638", "888f9dfd3f86ec41a2ad3ee9d3ec7365de9acfbedcddd48d12097816ff96a865"),
    ("dhaka-bd", "bn", "ac84c905d362b3a9b71cfa0198dcaef7d8faaf57443be4bfdc55417c2fb76752", "a6000d6b90afed504fde11bac7b164a9526aa57308d3f559bab05272ba4c455f"),
    ("osaka-jp", "ja", "31aca98cae91a153971be0430c3a858f6a4c19038b571633c9bfad1875f53650", "e8c355c739246ca08172a8af088b7ea673598a660993104c88b21a62f5c490fd"),
    ("new-york-ny", "en", "18d76148273accffc16daf8d2bcc4cbb69588b716d28f8b535fff59b828e13d4", "a8d968f62bc25cf17354c0c3b1caf8fca9eca874a495cbe9a37f33304b3443b8"),
    ("karachi-pk", "ur", "0292b0156e34077ca1e4c6913a397ef908818b96af9dc6af7d16073f324b0e92", "148d888cc350c84d4dd6f9bbd55ef09a7eafa3caf822555d8dd779a8d70a2ef3"),
    ("buenos-aires-ar", "es", "8c0a685ac8da37067e6afa42f6ff3708bd6707a1f79abe48181b524cf23c74f5", "686500768082f0892d254fb9a0e830b396c35a50846274f230108bb52d28ec09"),
    ("istanbul-tr", "tr", "ba3017ae1f199ad94e083efefa7a180c57db618f3faeb944bdc5802a5979cb58", "bf6e7a39ade9f67ab8cc003de3db5cfc1b6a9a854e06e2d6abb74f24a7cd4ffc"),
    ("kolkata-in", "bn", "80630ab605acaae39cae9cb897a39b4afcf8ac05c7d8f82dd500cc42732dcc43", "5e702d241de4a99a8edb64389179a25e37819af2f25d1589b91d4a3536faaf21"),
    ("manila-ph", "tl", "d5510d06f1dff3b015dad8ea5b7360eb3875c7c3b31d7e8b6c0850fd877f332b", "f3287fe6aebab76084b5373d71a334c81b44d016dfbf2907131b5cd5b3d7f022"),
    ("lagos-ng", "en", "ee6e877e59d8db64dd4521db7ddb7a552ac5b6e60f157ed62782882a9ab13643", "0b11c4a5efd37b57a2216fd236b9fe876cd9aedd9050f2842fb25ebd7d220de9"),
    ("rio-de-janeiro-br", "pt", "fb14bc2f9865b67328b357e46a120a4cba40a0d58772ba7c8582c67af0a2221e", "138ac82620cebbc0da894b56f939144f053ca20dcc8db53c70b60f0005a41121"),
    ("jakarta-id", "id", "1a8eb869948eb4545edfd3d84b092633b683471754abd5f59ccc9d223656a105", "ed4575fb0a94f4080967df1c9802aceace700f23c9896dc6f4e98cf93466e5eb"),
    ("los-angeles-ca", "en", "617e058651d00726b59b7d85df0ee06c1fe629835ffff7fb78fe21be9b1d0a7b", "4c403d2a6e532fa9e249a2ecc1afb33ea4b859635de09599e5cc38b343961d57"),
    ("moscow-ru", "ru", "cfefc4accb5f63afe5014fd6137cae946f4e18bdddc3bbbad9b048e6d4f8c01d", "eb6dc6c182caa2c67396a7d24b9eec46eecead6d00e918b1175b39b08b9db1eb"),
    ("paris-fr", "fr", "8ce7eea8556318c77dc482413c71b326e52d52441c1e48469c442059364fa3ac", "792c0c701fd84d996e262198f096a9ea1b863437a1717b9922c0b2a16150bb19"),
    ("london-gb", "en", "eee7377c9e75dc295d747ce234232a9e00ab8fe0cd2601a22936621f21cb215a", "ee6255f9f1265cf973282ebb4837a828c3ef55001ff8d55df113219eb0df8fd1"),
    ("bangkok-th", "th", "13bdead1dc1cb8eb1c652ae292e76deaf8499cc582f03b3a5b2dd521d44bf41a", "334b33886b280bbcaf7416417c9da1064701747b041f3f3a74669745a4b55678"),
    ("seoul-kr", "ko", "bac6165b0a26a78d679a84e62b01cf353899248e068f9f7be884bdc8322005ed", "dc3a4e3353a1456a49f81241b8eb95a6f5b319aebb86dc3d2b29408ab0a67c22"),
    ("lima-pe", "es", "232964011f4d711450637bcd743b2a346fb37de695f3b94d6c8f742f8e4f51cd", "d67803178e7b0137a6f40a8879383c4086fa6bc0bb55d0807c93718b6aa93dad"),
    ("bogota-co", "es", "6401536c0e134b008024527e87ecc3cb8e534ad99aa26cd1bacc3ccf5d3f8e4b", "c334e6ccaf6ca355d97265d7082b85e6b735eab181e4823c78e0a7070a39fb82"),
]

DISPLAY = {"sao-paulo-br": "São Paulo", "bogota-co": "Bogotá"}
NATIVE = {"tokyo-jp": "東京", "osaka-jp": "大阪", "shanghai-cn": "上海", "beijing-cn": "北京", "delhi-in": "दिल्ली",
          "mumbai-in": "मुंबई", "cairo-eg": "القاهرة", "dhaka-bd": "ঢাকা", "kolkata-in": "কলকাতা", "karachi-pk": "کراچی",
          "moscow-ru": "Москва", "bangkok-th": "กรุงเทพฯ", "seoul-kr": "서울", "mexico-city-mx": "Ciudad de México",
          "istanbul-tr": "İstanbul", "manila-ph": "Maynila", "jakarta-id": "Jakarta"}

# lang: (jobseeker line, business line, jobseeker tag, business tag)
LOCAL: Dict[str, tuple] = {
    "ja": ("{city}で、あなたのスキルを今日から収入に。報酬の90%はあなたのもの、当日払い。",
           "{city}の小さなお店・個人事業主の皆さん、Lumoで地元のお客様とつながりましょう。登録無料。",
           "求人", "中小企業"),
    "zh": ("在{city}，用你已有的技能赚钱：自由安排时间，保留90%收入，当天到账。",
           "{city}的小商家：在Lumo免费上架你的服务，让附近的顾客找到你。",
           "招聘", "小企业"),
    "pt": ("Em {city}, transforme o que você já sabe fazer em renda: fique com 90% e receba no mesmo dia.",
           "Tem um pequeno negócio em {city}? Anuncie seus serviços grátis na Lumo e encontre clientes da sua região.",
           "vagas", "pequenosnegocios"),
    "es": ("En {city}, gana dinero con lo que ya sabes hacer: tú eliges tu horario, te quedas con el 90% y cobras el mismo día.",
           "¿Tienes un pequeño negocio en {city}? Publica tus servicios gratis en Lumo y consigue clientes cerca de ti.",
           "empleo", "pymes"),
    "ar": ("في {city}، حوّل مهاراتك إلى دخل: اختر ساعاتك، واحتفظ بـ90٪ من أجرك، واحصل عليه في نفس اليوم.",
           "لديك مشروع صغير في {city}؟ اعرض خدماتك مجاناً على Lumo واكسب عملاء من منطقتك.",
           "وظائف", "مشاريع_صغيرة"),
    "hi": ("{city} में अपने हुनर से कमाई शुरू करें: अपने समय पर काम करें, 90% कमाई आपकी, उसी दिन भुगतान।",
           "{city} में छोटा व्यापार है? Lumo पर अपनी सेवाएँ मुफ़्त में जोड़ें और आस-पास के ग्राहक पाएँ।",
           "नौकरी", "व्यापार"),
    "bn": ("{city}-তে আপনার দক্ষতা দিয়ে আয় শুরু করুন: নিজের সময়ে কাজ, আয়ের ৯০% আপনার, একই দিনে পেমেন্ট।",
           "{city}-তে ছোট ব্যবসা আছে? Lumo-তে বিনামূল্যে আপনার সেবা যোগ করুন এবং কাছের গ্রাহক পান।",
           "চাকরি", "ব্যবসা"),
    "ur": ("{city} میں اپنی مہارت سے کمائی شروع کریں: اپنے وقت پر کام، 90٪ کمائی آپ کی، اسی دن ادائیگی۔",
           "{city} میں چھوٹا کاروبار ہے؟ Lumo پر اپنی خدمات مفت شامل کریں اور قریبی گاہک حاصل کریں۔",
           "نوکری", "کاروبار"),
    "tr": ("{city}'da bildiğin işi kazanca çevir: saatlerini sen seç, kazancın %90'ı senin, ödeme aynı gün.",
           "{city}'da küçük bir işletmen mi var? Hizmetlerini Lumo'da ücretsiz listele, yakındaki müşterilere ulaş.",
           "iş", "KOBİ"),
    "tl": ("Sa {city}, kumita gamit ang kakayahan mo: ikaw ang bahala sa oras, sa iyo ang 90%, bayad sa parehong araw.",
           "May maliit na negosyo sa {city}? Ilista nang libre ang serbisyo mo sa Lumo at makahanap ng kalapit na customer.",
           "trabaho", "negosyo"),
    "id": ("Di {city}, ubah keahlianmu jadi penghasilan: atur jam sendiri, 90% untukmu, dibayar di hari yang sama.",
           "Punya usaha kecil di {city}? Daftarkan jasamu gratis di Lumo dan dapatkan pelanggan di sekitarmu.",
           "lowongankerja", "UMKM"),
    "ru": ("В городе {city} зарабатывайте тем, что уже умеете: свой график, 90% дохода ваши, оплата в тот же день.",
           "Малый бизнес в городе {city}? Разместите свои услуги в Lumo бесплатно и находите клиентов рядом.",
           "работа", "малыйбизнес"),
    "fr": ("À {city}, gagnez de l'argent avec ce que vous savez déjà faire : vos horaires, 90 % pour vous, payé le jour même.",
           "Vous avez une petite entreprise à {city} ? Publiez vos services gratuitement sur Lumo et trouvez des clients près de chez vous.",
           "emploi", "petiteentreprise"),
    "th": ("ที่{city} เปลี่ยนทักษะของคุณเป็นรายได้: เลือกเวลาเอง รับ 90% ได้เงินภายในวันเดียวกัน",
           "มีธุรกิจเล็กๆ ใน{city}? ลงบริการของคุณบน Lumo ฟรี และหาลูกค้าใกล้บ้าน",
           "หางาน", "ธุรกิจ"),
    "ko": ("{city}에서 지금 가진 기술로 수입을 만드세요. 원하는 시간에, 수익의 90%를, 당일 정산으로.",
           "{city}에서 작은 가게를 운영하시나요? Lumo에 서비스를 무료로 등록하고 동네 고객을 만나세요.",
           "알바", "소상공인"),
}

JOB_TAGS = ["Hiring", "NowHiring", "JobsIn{c}", "{c}Jobs", "SideHustle", "GigWork", "GetPaidToday", "LocalJobs"]
BIZ_TAGS = ["SmallBusiness", "SmallBusinessOwner", "{c}Business", "ShopLocal", "SupportLocal", "Entrepreneur", "{c}SmallBusiness"]


def _tags(base: List[str], city: str, local: str = "") -> str:
    c = "".join(ch for ch in city if ch.isalnum())
    tags = [t.format(c=c) for t in base] + ([local] if local else []) + ["Lumo"]
    return " ".join(f"#{t}" for t in tags)


def _link(base_url: str, slug: str, kind: str) -> str:
    return (f"{base_url}/register?role=provider&recruit_city_slug={slug}"
            f"&utm_source=facebook&utm_medium=social&utm_campaign=city_ads_{kind}&utm_content={slug}")


def build_posts(city: Dict[str, Any], lang: str, jobs: List[tuple], base_url: str) -> Dict[str, Dict[str, str]]:
    name = DISPLAY.get(city["slug"], city["city"])
    native = NATIVE.get(city["slug"], name)
    loc = LOCAL.get(lang)
    bonus = float(city.get("bonus_amount") or 100)
    first_n = city.get("bonus_first_n") or 100
    job_lines = "\n".join(f"• {n}: {d}" for n, d in jobs)
    job_body = (
        (f"{loc[0].format(city=native)}\n\n" if loc else "")
        + f"Looking for work in {name}? Lumo is hiring local people right now, no experience needed for most jobs.\n\n"
        f"Jobs you can start picking up:\n{job_lines}\n\n"
        "• Keep 90% of every job\n• Choose your own hours\n• Get paid the same day\n"
        f"• ${bonus:.0f} loyalty bonus for the first {first_n} people who sign up in {name}\n\n"
        f"Sign up free and get first pick of jobs in {name}:\n{_link(base_url, city['slug'], 'jobs')}\n\n"
        + _tags(JOB_TAGS, name, loc[2] if loc else "")
    )
    biz_body = (
        (f"{loc[1].format(city=native)}\n\n" if loc else "")
        + f"Run a small business in {name}? Lumo puts you in front of local customers booking services right now.\n\n"
        "• List your services free: repairs, cleaning, beauty, catering, tutoring, delivery and more\n"
        "• Get booked and paid in the app, and keep 90% of every job\n"
        "• No monthly fees, no contracts\n"
        "• Short-handed? Find reliable local help for deliveries, errands and odd jobs\n\n"
        f"Grow your {name} business with Lumo:\n{_link(base_url, city['slug'], 'business')}\n\n"
        + _tags(BIZ_TAGS, name, loc[3] if loc else "")
    )
    return {
        "jobs": {"title": f"{name} is hiring. Get paid for what you already know how to do.", "body": job_body},
        "business": {"title": f"{name} small business owners: get more local customers.", "body": biz_body},
    }


async def run_campaign(db, base_url: str, gap_s: int = 25) -> Dict[str, Any]:
    from city_blog import local_jobs
    from social_publisher import publish_to_all
    sent = failed = 0
    for slug, lang, img_job, img_biz in CITIES:
        city = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not city:
            continue
        posts = build_posts(city, lang, await local_jobs(db, city), base_url)
        for kind, img in (("jobs", img_job), ("business", img_biz)):
            key = {"campaign": CAMPAIGN, "slug": slug, "kind": kind}
            if await db.city_ad_posts.find_one({**key, "ok": True}, {"_id": 1}):
                continue
            res = (await publish_to_all(db, {
                **posts[kind], "url": "", "hashtags": [], "image_url": f"{IMG}{img}.jpeg",
                "source_type": f"city_ad_{kind}", "source_id": slug, "require_photo": True,
            }, platforms=["facebook"])).get("facebook") or {}
            ok = bool(res.get("ok"))
            sent, failed = sent + ok, failed + (not ok)
            await db.city_ad_posts.update_one(key, {"$set": {
                "ok": ok, "external_id": res.get("external_id"), "error": str(res.get("error") or "")[:300],
                "at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            logger.info(f"[city_ads] {slug}/{kind} ok={ok} {str(res.get('error') or '')[:120]}")
            if "OAuthException" in str(res.get("error")):
                return {"sent": sent, "failed": failed, "aborted": "facebook token error"}
            await asyncio.sleep(gap_s)
    return {"sent": sent, "failed": failed}


def create_router(*, db, require_admin, base_url: str) -> APIRouter:
    r = APIRouter(prefix="/api")
    tasks: set = set()

    async def _job():
        await db.city_blog_config.update_one({"id": CAMPAIGN}, {"$set": {"state": "running"}}, upsert=True)
        try:
            res = await run_campaign(db, base_url)
            await db.city_blog_config.update_one({"id": CAMPAIGN}, {"$set": {"state": "done", **res}})
        except Exception as e:  # noqa: BLE001
            logger.exception("[city_ads] failed")
            await db.city_blog_config.update_one({"id": CAMPAIGN}, {"$set": {"state": "error", "error": str(e)[:300]}})

    def _start(delay: int = 0):
        async def go():
            await asyncio.sleep(delay)
            await _job()
        t = asyncio.create_task(go())
        tasks.add(t)
        t.add_done_callback(tasks.discard)

    @r.get("/admin/city-ads/status")
    async def status(_a: dict = Depends(require_admin)):
        doc = await db.city_blog_config.find_one({"id": CAMPAIGN}, {"_id": 0}) or {"state": "idle"}
        doc["posted"] = await db.city_ad_posts.count_documents({"campaign": CAMPAIGN, "ok": True})
        doc["total"] = len(CITIES) * 2
        return doc

    @r.post("/admin/city-ads/run")
    async def run(_a: dict = Depends(require_admin)):
        _start()
        return {"ok": True, "started": True}

    @r.on_event("startup")
    async def _auto():
        # Fires once per environment where the Facebook Page is connected (i.e. production).
        fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
        cur = await db.city_blog_config.find_one({"id": CAMPAIGN}, {"_id": 0}) or {}
        if fb.get("enabled") and fb.get("access_token") and fb.get("page_id") and cur.get("state") != "done":
            _start(delay=120)

    return r
