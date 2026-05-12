const ACCESS_TOKEN = "APP_USR-3255576921796668-051120-f67f680861fd359c58e74c76e519686b-3296567360";
const REFRESH_TOKEN = "TG-6a026eb5e018440001cc99b5-3296567360";
const CLIENT_ID = "3255576921796668";
const CLIENT_SECRET = "hR225NknGGDvqJAUV90GkdwjApYJ4Zhp";

let cachedToken = ACCESS_TOKEN;
let tokenExpiry = Date.now() + (5 * 60 * 60 * 1000);

async function getValidToken(fetch) {
  if (Date.now() < tokenExpiry - 60000) return cachedToken;
  try {
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
    });
    if (!res.ok) return cachedToken;
    const data = await res.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + ((data.expires_in || 21600) * 1000);
    }
    return cachedToken;
  } catch {
    return cachedToken;
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
    const token = await getValidToken(fetch);
    const mlHeaders = { "Authorization": "Bearer " + token };

    // 1. Usuário
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    if (!meRes.ok) throw new Error("Token inválido ou expirado");
    const me = await meRes.json();
    const userId = me.id;

    // 2. Anúncios
    const itemsRes = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?limit=50`, { headers: mlHeaders });
    const itemsData = await itemsRes.json();
    const ids = (itemsData.results || []).slice(0, 20);

    let listings = [];
    if (ids.length > 0) {
      const batchRes = await fetch(`https://api.mercadolibre.com/items?ids=${ids.join(",")}&attributes=id,title,price,status,listing_type_id,available_quantity,sold_quantity`, { headers: mlHeaders });
      const batchData = await batchRes.json();
      listings = batchData.filter(r => r.code === 200).map(r => r.body);
    }

    // 3. Pedidos
    const ordersRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&sort=date_desc&limit=50`, { headers: mlHeaders });
    const ordersData = ordersRes.ok ? await ordersRes.json() : { results: [] };
    const orders = ordersData.results || [];

    // 4. Vendas do dia
    const hoje = new Date().toISOString().slice(0, 10);
    const vendasHoje = orders.filter(o => o.status === "paid" && (o.date_created || "").startsWith(hoje));
    const totalHoje = vendasHoje.reduce((s, o) => s + (o.total_amount || 0), 0);

    // 5. Visitas dos anúncios (últimas 24h)
    let totalVisitas = 0;
    if (ids.length > 0) {
      try {
        const visitsRes = await fetch(
          `https://api.mercadolibre.com/items/visits?ids=${ids.join(",")}&last_days=1`,
          { headers: mlHeaders }
        );
        if (visitsRes.ok) {
          const visitsData = await visitsRes.json();
          if (Array.isArray(visitsData)) {
            totalVisitas = visitsData.reduce((s, v) => s + (v.total_visits || 0), 0);
          }
        }
      } catch { totalVisitas = 0; }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          nickname: me.nickname,
          email: me.email,
          reputation: me.seller_reputation
        },
        listings,
        orders,
        total_items: itemsData.paging?.total || listings.length,
        hoje: {
          visitas: totalVisitas,
          vendas_valor: totalHoje,
          vendas_qtd: vendasHoje.length
        }
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
