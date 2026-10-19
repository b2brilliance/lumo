"""Top-27 metro Facebook campaign: one jobseeker + one small-business post per city, with local service photos."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import re
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


# Second wave (next 54 metros).
WAVE2: List[tuple] = [
    ("nairobi-ke", "sw", "33efcad8851a9f77371cd0b54e3533cca7fd3bbe69510f0500c1220d35354720", "6b3a22d9ba31aff3332e4235163f67ae9458ae92a8fa520fc3b323add1c789bc"),
    ("ho-chi-minh-city-vn", "vi", "56cd207a673f1db3336dc4043378cd53ad38285c3f940986dd5f40e73cbc312f", "8a86903e47ee5bb26e9fa7701906672989fb3c669c2a83c710c69aec076d12b6"),
    ("riyadh-sa", "ar", "5158b258041ac78b76385ac6a641981747a0d0af2710dc8140c7932a0c822769", "b40ff82b944bd44a9713e8b36c25831236acb87897582b375fdfcdfe59077030"),
    ("johannesburg-za", "en", "a2261f037dec28f85efd6b5e6b1b0f7415e6299b56f71591f19310e3e993538d", "87e43139aae170595e2e84a399c61975b67e2cbefe02580da4b9348a3b2f81db"),
    ("kinshasa-cd", "fr", "99c42cc163a90d2418606003812ee2eeb456734624200df201e4fea3760c6183", "d85cf8c664da6ba7fc6170cd2c36d237af67dd3e20dbb3131e4cd134702f1ae6"),
    ("lahore-pk", "ur", "8272832782686eb43c877e7b306abcc6fff5f0d2f4331bea618f64dd2a2361e8", "86588a7625560690b1e075d70b681f7b0bba9cde1d4a91b261b24c65afeae472"),
    ("bengaluru-in", "kn", "920fe134d50e5bd6429c34a60b86518ac9ae34e10bc9eca1c63316829edaa045", "d3527d06a66fb8e112a935760a3027867e6e5a0adbc8af8455b0e05f7cd620f8"),
    ("chennai-in", "ta", "063f52c0d29e1457ca6230294e7a2ab00d68b9566bee7fdf261b2be9e65b8eaa", "32f82729d479580aaaf5e2c42068ae51303d2109ffdf6c20941b54dcfdbc0328"),
    ("hyderabad-in", "te", "b7cb52783d027e2cd70bcf648f3039853149098b77a9ce203a46e1a17d04a99a", "bd3d2c981723d24f4a3867441e285873eca4bed8b1140c40eacb65b0d2f18fdc"),
    ("chicago-il", "en", "4e100454669ac5b6c40436208db8c5b62f1db0a504449c1e60f07b83c3c1c30d", "e84fbe5fbf0e984c3ae236c4d665ba498fe9f0129bb83a8fe32a4a52c1dc830e"),
    ("toronto-ca", "en", "a964b966a3ffe5671c2a93ee1c0c29f8380d50e2f9856bb9d0c6e7f04640d224", "65ed77393eb1cfa6f9e73178a35d39a2d2907ddbfd4eecd8ac88751091975b1b"),
    ("madrid-es", "es", "4f38e0bd7109166714a0ee12bbfcbbaec2a3c9194ad25d7b23914eed5300f24c", "4ec25d5c25746e649e248581ecd556267c764c2881badcc5261e4895ee399241"),
    ("berlin-de", "de", "79bdd4d32abb07aa326b8a00ec0a7c3dbaf8e6d5036e1f8efc73c67cd8257726", "9b4ee918d5394d53af83b29b134367380f21ed7d44a440d6ae52775c74fe339e"),
    ("rome-it", "it", "36ccfd6e90cd74a42882b5a3bb28bb545fd04229f8fc8e2b2221371ee1b1ea5f", "4a996130eb054986c0ed80c6e0026dcd25d9b0a807e3c568f81c7cf3a773956b"),
    ("santiago-cl", "es", "2418ea524bbead366bc922497def7c43dc79997b5cab2154643ade3858dfafda", "b847a17a746f8962f3d139406ca060d5502dcde1cde3969e9e601d2604fe656b"),
    ("hanoi-vn", "vi", "a046d3a92e72c0e7147941c3171baf032a12cb114d38bc8ae8d28abfd7111b2e", "645796b47fb6f3e368f0ad85d1deae276c1a1ad6a70b38261417c365210b208a"),
    ("kuala-lumpur-my", "ms", "af3072108164d572399defc3c5644357850f67c8028684919a0768f00f9d46dd", "77f3c93fb1d06d0ea3587d6d7afe07e9e36cd68047616b0bf5e5a9bae856be5b"),
    ("singapore-sg", "en", "58ed29a83a4ecd2b1f100bc449c9fbcffe89126ef737c4344038b4b5fca083cc", "081bb02a06084b1d83f49d134c772d975725684e156d54b51ce5df3fec2c4a8a"),
    ("dubai-ae", "ar", "1e07143a6826e7c4bb1348f72544da076a1d876ed4d21ed868338bfa633a43e5", "64c39ce28d121fd3d07bccee2d68feedd44b8437cf4604cbdac5ab60a9b8f74b"),
    ("tehran-ir", "fa", "24e9f71e46bb406814a04fe1540520858cd7a05b3442a3b5f227aa9e8a36a04b", "64bff078e0ac6729c3f36480676deb72fb7360f567996a1ab6a7b190416ece5d"),
    ("baghdad-iq", "ar", "fe2da8b15d16f6fffc21f27581fa1fa22951fcba55f79736c8e3c7f6e5cd52dc", "2b12092974207bdb870b7d2bc8799de639b9cb3c6099b735d3032f7e59e1fd1f"),
    ("accra-gh", "en", "a1eb73076fd83cfbebdbbb7f64c3beacb9fb8966bae2bdd6e90f3d98954f9bc5", "5428b4bdade7dcf810a6b03d239ed267d610237217860eb3e8d8309fc5944265"),
    ("addis-ababa-et", "am", "5378318e1178d659b9b086f3e282d132177d72ba6987f8951801d5473427ca1a", "50f96eeb6e44de4fefc9e79b1b1f33a3f887508c8081a75d9d7e95f0da406084"),
    ("dar-es-salaam-tz", "sw", "25303e207a8c5b14a7dcc30692b56017ecf924682a5ca307c6db4fbcfc9056fd", "df138ebe9676af354eef38247f41ace48e313c0ec2b2dcbc772567b021b384c6"),
    ("houston-tx", "en", "632641daadb2fd6fd5c6db8fcc378a0658f931813b7060f54ba80163481065c1", "849c8ccc93d6c5fe7ebc83f2ec712b3be5d82f91653c101c8d82b312ac59619e"),
    ("sydney-au", "en", "9d7816934d28f233b2b15e22cabe295bd4c078fdf14857041717d4dc6fcca3c0", "47d1f0d4708eb1e22c86195888444daac4f1f50618d88a5823f0fe07a63764f4"),
    ("guadalajara-mx", "es", "edc4f6f1700f4046294e06158e513a0eb572a91862d1fce63ad170de47b64c47", "a57a7283adba575784822a19c47030fab559233b41b46cb77a6573826f642ae9"),
    ("shenzhen-cn", "zh", "11a92f2b0e4e2255c63cfe34b2353d6dd6fdba62cb7c19bc0a50b5acd4df317f", "4f66cd0da0d90b5aac72e7886bb23d92f048d82f09fc571b54fd2cb42a4feb57"),
    ("guangzhou-cn", "zh", "c3c2908b847625a6ca43d0d8dad02d7f30b71a1c9badffb7870802ee685ded14", "13c2eb94348fda13ee3d30804088f95decd2a0091d847249d297567947964bfe"),
    ("chengdu-cn", "zh", "9e76613e7910f3a6a0e1f085906b5ad30271889eb7598d4668b4bf973d31281f", "c218881c1f18a40eff39ea4354b981eddbd119b057d923548508364a254dee75"),
    ("pune-in", "mr", "33469f2638f212bf3385e5284ef5994a917f0b40cb698dd1c25fb34f7fc9c18b", "74f9588fa5f7a540165661f20c03186e4c2e0724a87eb503e0884a949365f747"),
    ("ahmedabad-in", "gu", "e510c229e548eb9b572a70200580f5ba14ad6abf8d00d097a06d289bde374530", "aba271da67632df62916b809a36948bc0ce020325f1bbeaeb0987ccd8627689e"),
    ("luanda-ao", "pt", "142468267965a35ce63f71aa400dfe991d27d41d3ebec22643e8b7773e8a94ac", "32a3b344ae123fd988e1fe5dea512ec9ace447db8e35add939a7d38f524ada7d"),
    ("abidjan-ci", "fr", "7aed2b2ea72bccecb34a86d322f447da9617ddb4a3b155126de4527b23337bb4", "19eb54397ca7b1cec106ddd797b31cf64481236169836822f4d5f6e95a5644d8"),
    ("casablanca-ma", "ar", "3b0dc07ee64daff86f3d60f186383c5b2ca7544bcbcf42b991ebfabae6bcd58e", "40a6ac5f7fda89e509091ee262095e988df5328c34bb7fd0e538924ac4853671"),
    ("alexandria-eg", "ar", "6f0c12b956542563dbac11edf39b24c83ea304fa510f9997d67905b38dce24f1", "18131a91183e882d8a8d1c04a65eb5a400f7d4098c08611e48fc549074d7b089"),
    ("yangon-mm", "my", "21fafe0ef35e2d0c56e7d6ddf00324cbd1588f9c5cd9dd93759d12b1e36fd677", "d14c5aa7f393bee57da5d1275898576109aa050f88562253a35eac8b0a698bdd"),
    ("philadelphia-pa", "en", "8611bbf0c065e7902d6ad1992c8cdea7a5d9bfefbd6091861570e741c8636f8a", "60e2894f18ae104b8ed6862f24945a5d50ae97e213ea6ab07f98efed9a4bdfb5"),
    ("dallas-tx", "en", "dcc0b68d5c5f6b9b30b75ae5c854e74f0b7eb8fce764461ba2f70e14358bea66", "4262f8bc16a297f6900c259b8ddbf0534173da072da2ae617ea33836dc9098b1"),
    ("miami-fl", "es", "cd239c3b3d00970d3207ad1a678d4d220431a82556dbdf98e8d09199e0867988", "272999f04ea63e3649965adeb4d23e3608c46fd0e44df74b1dadb76a8b5472a3"),
    ("atlanta-ga", "en", "aca705a43f2dcf8d3cd6c238d991608846b172633f6d7e34394c53c26e49621e", "79be2a08791e641fe13b859ff13fb580ace273ec70fc8324ed708e4887b07bfc"),
    ("montreal-ca", "fr", "14e6c0c2a3dd7dc7e7ad20e54886d3785d622dcbc0db048f72b58bdb7b952536", "3ca6dbb6586e42cbdc6bd71ab18a04c9ab6c5aafabd5753a9540d554e8ea2cc8"),
    ("barcelona-es", "es", "144d917b70f73b6967c4d89535a9f333fd8fa97afcad83d9f9a187278a0c2b33", "396dca102b8adb2881fb101a383591ec9078f5b5a746707d09b1dd84eda7612f"),
    ("milan-it", "it", "f11952f327caafec8dd56cfd50c61b178b0e98825aa75073fab9f8bf33d4d533", "f7177e8d04ad3c247e1cdccebb453650277a873b5076202510ffeef854fef0ff"),
    ("belo-horizonte-br", "pt", "1f6957feb143c95d5e9f7200348a5c1ad3a9cb3b21342fc88a99e563d84f3bcc", "8a7b7d80f04ba4fe11e6d960702e95f138ae33dfba9954a4f8a2f25222579ec4"),
    ("medellin-co", "es", "bfb47acbec303af61f43899d0c246af0bb98150eed8a1c1d44c0efa02864f981", "26f572905e4b2ea4e54eefe564b901cff87cd9bd7bb89f1321b80e342164255b"),
    ("monterrey-mx", "es", "e3962b0737f547d2db9424559982ace05c9743dc9c27395b05941703bd30201d", "0ccf5ac801b37ece9acbc23760c05148dea7a0fa37ae0470bf567e6165962e18"),
    ("melbourne-au", "en", "2a700c4b73924053cce99bf41f09316ba4bfad21b5d91dd401f099976ebae452", "2808104f3fea9cdd9192fd42544cae0c1d84f5ec99efdce880f85f267b0dd1ab"),
    ("ankara-tr", "tr", "8571de2580168a1bf983bc7ab6456e80f4117b6b0aad3896874fdafa9946f7f2", "ddf48f628029b9546309b41f13158693aaf02a61539fa0ab3ec1cbd1ef5561af"),
    ("jeddah-sa", "ar", "cdcedbe798c5dcaae1dad2907f298db521c63f1e76e281338efdb30fd2fdc42d", "d73d96e9fa1fa1525baf3de55dfdbee700d3d0bbcf18474e244078c9f51be5a7"),
    ("kano-ng", "ha", "9cb3662d67a85d31ac11d82a8ab144cbe954898332a28bf8b257d327fe455400", "6d43ed6f4fafef6ff57ee1876b5c6ff60cad7f6ab5d9f9be81150d2626981fab"),
    ("chattogram-bd", "bn", "62027f0ce44b10f1ef313dcd808294d887442c32a418094ffeb96063f9c914ea", "0abde858c4f236708be9133b05d77d50086ff1a5ae7ef181d5adf7621e4662b7"),
    ("taipei-tw", "zh-TW", "2599902e39e76f276560bae7d8ac0864789debb33fc64ef77b24767d95a96d41", "b1f60c8869e79c43acd7889cd14fc24ca80f5a5f4b80cf646c1af66473a8f705"),
    ("busan-kr", "ko", "59a79da7c59eb4f39ad85195446159deb9ca7b9f30a6f727cde936f9752d1f71", "fe15f9ec99a3af9289bc3c89e1539a2b6c8ad2ccd422538f16fede47ae7cb9ec"),
]
CAMPAIGNS = {CAMPAIGN: CITIES, "wave2_v1": WAVE2}
BY_SLUG = {c[0]: c for c in CITIES + WAVE2}

DISPLAY = {"sao-paulo-br": "São Paulo", "bogota-co": "Bogotá", "medellin-co": "Medellín", "montreal-ca": "Montréal"}
NATIVE = {"tokyo-jp": "東京", "osaka-jp": "大阪", "shanghai-cn": "上海", "beijing-cn": "北京", "delhi-in": "दिल्ली",
          "mumbai-in": "मुंबई", "cairo-eg": "القاهرة", "dhaka-bd": "ঢাকা", "kolkata-in": "কলকাতা", "karachi-pk": "کراچی",
          "moscow-ru": "Москва", "bangkok-th": "กรุงเทพฯ", "seoul-kr": "서울", "mexico-city-mx": "Ciudad de México",
          "istanbul-tr": "İstanbul", "manila-ph": "Maynila", "jakarta-id": "Jakarta",
          "ho-chi-minh-city-vn": "TP. Hồ Chí Minh", "hanoi-vn": "Hà Nội", "riyadh-sa": "الرياض", "jeddah-sa": "جدة",
          "dubai-ae": "دبي", "baghdad-iq": "بغداد", "casablanca-ma": "الدار البيضاء", "alexandria-eg": "الإسكندرية",
          "tehran-ir": "تهران", "lahore-pk": "لاہور", "bengaluru-in": "ಬೆಂಗಳೂರಿನ", "chennai-in": "சென்னை",
          "hyderabad-in": "హైదరాబాద్", "pune-in": "पुणे", "ahmedabad-in": "અમદાવાદ", "addis-ababa-et": "አዲስ አበባ",
          "yangon-mm": "ရန်ကုန်", "shenzhen-cn": "深圳", "guangzhou-cn": "广州", "chengdu-cn": "成都",
          "taipei-tw": "臺北", "busan-kr": "부산", "chattogram-bd": "চট্টগ্রাম", "berlin-de": "Berlin", "rome-it": "Roma",
          "milan-it": "Milano"}

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
    "vi": ("Tại {city}, kiếm tiền từ kỹ năng bạn đã có: tự chọn giờ làm, giữ 90% thu nhập, nhận tiền trong ngày.",
           "Bạn có cửa hàng nhỏ ở {city}? Đăng dịch vụ miễn phí trên Lumo và tìm khách hàng gần bạn.",
           "việclàm", "kinhdoanhnhỏ"),
    "de": ("In {city} mit dem Geld verdienen, was du schon kannst: eigene Zeiten, 90 % für dich, Auszahlung am selben Tag.",
           "Kleines Unternehmen in {city}? Biete deine Leistungen kostenlos auf Lumo an und finde Kunden in der Nähe.",
           "Jobs", "Kleinunternehmen"),
    "it": ("A {city}, guadagna con quello che sai già fare: orari tuoi, il 90% a te, pagamento in giornata.",
           "Hai una piccola attività a {city}? Pubblica i tuoi servizi gratis su Lumo e trova clienti vicino a te.",
           "lavoro", "piccoleimprese"),
    "ms": ("Di {city}, jana pendapatan dengan kemahiran anda: pilih waktu sendiri, simpan 90%, dibayar hari yang sama.",
           "Ada perniagaan kecil di {city}? Senaraikan perkhidmatan anda secara percuma di Lumo dan dapatkan pelanggan berdekatan.",
           "kerjakosong", "PKS"),
    "fa": ("در {city} با مهارت‌هایی که داری درآمد کسب کن: ساعت کاری با خودت، ۹۰٪ درآمد مال تو، پرداخت همان روز.",
           "کسب‌وکار کوچک در {city} داری؟ خدماتت را رایگان در Lumo ثبت کن و مشتری‌های نزدیک را پیدا کن.",
           "استخدام", "کسب_و_کار"),
    "am": ("በ{city} ባለዎት ችሎታ ገቢ ያግኙ፦ ሰዓትዎን እርስዎ ይምረጡ፣ 90% የእርስዎ ነው፣ ክፍያ በዚያው ቀን።",
           "በ{city} አነስተኛ ንግድ አለዎት? አገልግሎትዎን በLumo ላይ በነጻ ያስመዝግቡ እና በአቅራቢያ ያሉ ደንበኞችን ያግኙ።",
           "ሥራ", "ንግድ"),
    "sw": ("Huko {city}, pata kipato kwa ujuzi ulionao: chagua saa zako, baki na 90%, lipwa siku hiyo hiyo.",
           "Una biashara ndogo {city}? Orodhesha huduma zako bure kwenye Lumo na upate wateja wa karibu.",
           "ajira", "biasharandogo"),
    "my": ("{city} တွင် သင့်ကျွမ်းကျင်မှုဖြင့် ဝင်ငွေရှာပါ - အချိန်ကို ကိုယ်တိုင်ရွေး၊ ၉၀% သင့်အတွက်၊ တစ်နေ့တည်း ငွေရ။",
           "{city} တွင် လုပ်ငန်းငယ်ရှိပါသလား? Lumo တွင် သင့်ဝန်ဆောင်မှုကို အခမဲ့ တင်ပြီး အနီးနားဖောက်သည်များ ရယူပါ။",
           "အလုပ်", "လုပ်ငန်း"),
    "kn": ("{city}ಲ್ಲಿ ನಿಮ್ಮ ಕೌಶಲ್ಯದಿಂದ ಗಳಿಸಿ: ನಿಮ್ಮ ಸಮಯ, 90% ಗಳಿಕೆ ನಿಮ್ಮದು, ಅದೇ ದಿನ ಪಾವತಿ.",
           "{city}ಲ್ಲಿ ಸಣ್ಣ ವ್ಯಾಪಾರ ಇದೆಯೇ? Lumo ನಲ್ಲಿ ನಿಮ್ಮ ಸೇವೆಗಳನ್ನು ಉಚಿತವಾಗಿ ಸೇರಿಸಿ, ಹತ್ತಿರದ ಗ್ರಾಹಕರನ್ನು ಪಡೆಯಿರಿ.",
           "ಉದ್ಯೋಗ", "ವ್ಯಾಪಾರ"),
    "ta": ("{city}யில் உங்கள் திறமையால் சம்பாதியுங்கள்: உங்கள் நேரம், 90% வருமானம் உங்களுக்கு, அதே நாளில் பணம்.",
           "{city}யில் சிறு தொழில் உள்ளதா? Lumo-வில் உங்கள் சேவைகளை இலவசமாக பதிவு செய்து அருகிலுள்ள வாடிக்கையாளர்களைப் பெறுங்கள்.",
           "வேலைவாய்ப்பு", "சிறுதொழில்"),
    "te": ("{city}లో మీ నైపుణ్యంతో సంపాదించండి: మీ సమయం, 90% ఆదాయం మీదే, అదే రోజు చెల్లింపు.",
           "{city}లో చిన్న వ్యాపారం ఉందా? Lumoలో మీ సేవలను ఉచితంగా జోడించి దగ్గర్లోని కస్టమర్లను పొందండి.",
           "ఉద్యోగాలు", "వ్యాపారం"),
    "mr": ("{city}मध्ये तुमच्या कौशल्याने कमाई करा: तुमची वेळ, 90% कमाई तुमची, त्याच दिवशी पेमेंट.",
           "{city}मध्ये छोटा व्यवसाय आहे? Lumo वर तुमच्या सेवा मोफत जोडा आणि जवळचे ग्राहक मिळवा.",
           "नोकरी", "व्यवसाय"),
    "gu": ("{city}માં તમારી આવડતથી કમાણી કરો: તમારો સમય, 90% કમાણી તમારી, એ જ દિવસે ચુકવણી.",
           "{city}માં નાનો વ્યવસાય છે? Lumo પર તમારી સેવાઓ મફત ઉમેરો અને નજીકના ગ્રાહકો મેળવો.",
           "નોકરી", "વ્યવસાય"),
    "ha": ("A {city}, ka sami kudi da gwanintar da kake da ita: zaɓi lokacinka, kashi 90% naka ne, biya a rana guda.",
           "Kana da ƙaramin kasuwanci a {city}? Saka ayyukanka kyauta a Lumo ka sami abokan ciniki na kusa.",
           "aiki", "kasuwanci"),
    "zh-TW": ("在{city}，用你已有的技能賺錢：自由安排時間，保留90%收入，當天入帳。",
              "{city}的小店家：在Lumo免費刊登你的服務，讓附近的顧客找到你。",
              "徵才", "小店家"),
}

JOB_TAGS = ["Hiring", "NowHiring", "JobsIn{c}", "{c}Jobs", "SideHustle", "GigWork", "GetPaidToday", "LocalJobs"]
BIZ_TAGS = ["SmallBusiness", "SmallBusinessOwner", "{c}Business", "ShopLocal", "SupportLocal", "Entrepreneur", "{c}SmallBusiness"]


def _tags(base: List[str], city: str, local: str = "") -> str:
    c = "".join(ch for ch in city if ch.isalnum())
    tags = [t.format(c=c) for t in base] + ([local] if local else []) + ["Lumo"]
    return " ".join(f"#{t}" for t in tags)


def _link(base_url: str, slug: str, kind: str) -> str:
    path = f"/business/{slug}?" if kind == "business" else f"/register?role=provider&recruit_city_slug={slug}&"
    return f"{base_url}{path}utm_source=facebook&utm_medium=social&utm_campaign=city_ads_{kind}&utm_content={slug}"


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


async def run_campaign(db, base_url: str, campaign: str = CAMPAIGN, gap_s: int = 25) -> Dict[str, Any]:
    from city_blog import local_jobs
    from social_publisher import publish_to_all
    sent = failed = 0
    for slug, lang, img_job, img_biz in CAMPAIGNS[campaign]:
        city = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not city:
            continue
        posts = build_posts(city, lang, await local_jobs(db, city), base_url)
        for kind, img in (("jobs", img_job), ("business", img_biz)):
            key = {"campaign": campaign, "slug": slug, "kind": kind}
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
                "relinked": kind == "business", "at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            logger.info(f"[city_ads] {campaign} {slug}/{kind} ok={ok} {str(res.get('error') or '')[:120]}")
            if "OAuthException" in str(res.get("error")):
                return {"sent": sent, "failed": failed, "aborted": "facebook token error"}
            await asyncio.sleep(gap_s)
    return {"sent": sent, "failed": failed}


async def relink_business_posts(db, base_url: str) -> Dict[str, Any]:
    """Point already-published business posts at the /business/{city} landing page."""
    from social_publisher import _graph_ver
    fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
    token = fb.get("access_token")
    done = failed = 0
    async with httpx.AsyncClient(timeout=30) as client:
        async for p in db.city_ad_posts.find({"kind": "business", "ok": True, "relinked": {"$ne": True}}, {"_id": 0}):
            city = await db.recruit_cities.find_one({"slug": p["slug"]}, {"_id": 0})
            if not (city and p.get("external_id") and p["slug"] in BY_SLUG):
                continue
            post = build_posts(city, BY_SLUG[p["slug"]][1], [], base_url)["business"]
            r = await client.post(f"https://graph.facebook.com/{_graph_ver()}/{p['external_id']}",
                                  data={"message": f"{post['title']}\n\n{post['body']}", "access_token": token})
            ok = r.status_code < 300
            done, failed = done + ok, failed + (not ok)
            await db.city_ad_posts.update_one({"campaign": p["campaign"], "slug": p["slug"], "kind": "business"},
                                              {"$set": {"relinked": ok, "relink_error": "" if ok else r.text[:300]}})
            await asyncio.sleep(3)
    return {"relinked": done, "failed": failed}


def business_city(slug: str, city: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    row = BY_SLUG.get(slug)
    lang = row[1] if row else city.get("lang") or "en"
    name = DISPLAY.get(slug, city["city"])
    loc = LOCAL.get(lang)
    return {
        "slug": slug, "city": name, "native_name": NATIVE.get(slug, name), "country_name": city.get("country_name"),
        "country": city.get("country"), "lang": lang,
        "local_line": loc[1].format(city=NATIVE.get(slug, name)) if loc else None,
        "hero_image": f"{IMG}{row[3]}.jpeg" if row else f"{base_url}/api/img/city/{slug}.jpg",
        "rtl": lang in ("ar", "fa", "ur", "he"),
    }


CATEGORIES = ["Repairs & handyman", "Cleaning", "Beauty & wellness", "Food & catering", "Delivery & errands",
              "Moving & hauling", "Auto services", "Tutoring & lessons", "Tech help", "Pet care", "Other"]


class LeadIn(BaseModel):
    city_slug: str = Field(..., max_length=80)
    business_name: str = Field(..., min_length=2, max_length=120)
    category: str = Field(..., max_length=60)
    contact_name: str = Field("", max_length=120)
    phone: str = Field("", max_length=40)
    email: str = Field("", max_length=160)
    utm_source: str = Field("", max_length=60)
    utm_campaign: str = Field("", max_length=80)
    utm_content: str = Field("", max_length=80)


def create_router(*, db, require_admin, base_url: str) -> APIRouter:
    r = APIRouter(prefix="/api")
    tasks: set = set()

    async def _job():
        for campaign in CAMPAIGNS:
            cur = await db.city_blog_config.find_one({"id": campaign}, {"_id": 0}) or {}
            if cur.get("state") == "done":
                continue
            await db.city_blog_config.update_one({"id": campaign}, {"$set": {"state": "running"}}, upsert=True)
            try:
                res = await run_campaign(db, base_url, campaign)
                await db.city_blog_config.update_one({"id": campaign}, {"$set": {
                    "state": "error" if res.get("aborted") else "done", **res}})
                if res.get("aborted"):
                    return
            except Exception as e:  # noqa: BLE001
                logger.exception("[city_ads] failed")
                await db.city_blog_config.update_one({"id": campaign}, {"$set": {"state": "error", "error": str(e)[:300]}})
                return
        try:
            res = await relink_business_posts(db, base_url)
            await db.city_blog_config.update_one({"id": "city_ads_relink"}, {"$set": res}, upsert=True)
        except Exception:  # noqa: BLE001
            logger.exception("[city_ads] relink failed")

    def _start(delay: int = 0):
        if tasks:
            return False
        async def go():
            await asyncio.sleep(delay)
            await _job()
        t = asyncio.create_task(go())
        tasks.add(t)
        t.add_done_callback(tasks.discard)
        return True

    @r.get("/admin/city-ads/status")
    async def status(_a: dict = Depends(require_admin)):
        out = {}
        for campaign, cities in CAMPAIGNS.items():
            doc = await db.city_blog_config.find_one({"id": campaign}, {"_id": 0}) or {"state": "idle"}
            doc["posted"] = await db.city_ad_posts.count_documents({"campaign": campaign, "ok": True})
            doc["total"] = len(cities) * 2
            out[campaign] = doc
        out["relink"] = await db.city_blog_config.find_one({"id": "city_ads_relink"}, {"_id": 0, "id": 0})
        out["running"] = bool(tasks)
        return out

    @r.post("/admin/city-ads/run")
    async def run(_a: dict = Depends(require_admin)):
        return {"ok": True, "started": _start()}

    @r.get("/business/cities/{slug}")
    async def biz_city(slug: str):
        city = await db.recruit_cities.find_one({"slug": slug, "is_active": {"$ne": False}}, {"_id": 0})
        if not city:
            raise HTTPException(404, "City not found")
        return {**business_city(slug, city, base_url), "categories": CATEGORIES,
                "businesses_joined": await db.business_leads.count_documents({"city_slug": slug})}

    @r.post("/business/leads")
    async def create_lead(body: LeadIn):
        if not (body.phone.strip() or body.email.strip()):
            raise HTTPException(422, "Add a phone number or email")
        if body.email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", body.email.strip()):
            raise HTTPException(422, "Invalid email")
        city = await db.recruit_cities.find_one({"slug": body.city_slug}, {"_id": 0, "city": 1})
        if not city:
            raise HTTPException(404, "City not found")
        doc = {"id": str(uuid.uuid4()), **{k: v.strip() for k, v in body.model_dump().items()},
               "city": DISPLAY.get(body.city_slug, city["city"]), "status": "new",
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.business_leads.insert_one(doc)
        return {"ok": True, "id": doc["id"]}

    @r.on_event("startup")
    async def _auto():
        # Fires where the Facebook Page is connected (production); finished campaigns are skipped.
        fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
        if fb.get("enabled") and fb.get("access_token") and fb.get("page_id"):
            _start(delay=120)

    return r
