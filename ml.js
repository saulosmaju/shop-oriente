const ACCESS_TOKEN = "APP_USR-3255576921796668-051120-f67f680861fd359c58e74c76e519686b-3296567360";

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
    const mlHeaders = { "Authorization": "Bearer " + ACCESS_TOKEN };

    // 1. Usuário
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    if (!meRes.ok) throw new Error("Token inválido ou expirado");
    const me = await meRes.json();
    const userId = me.id;

    // 2. Anúncios
    const itemsRes = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?limit=50`, { headers: mlHeaders });
    const itemsData = await itemsRes.json();
    const ids = (itemsData.results || []).slice(0, 20).join(",");

    let listings = [];
    if (ids) {
      const batchRes = await fetch(`https://api.mercadolibre.com/items?ids=${ids}&attributes=id,title,price,status,listing_type_id,available_quantity,sold_quantity`, { headers: mlHeaders });
      const batchData = await batchRes.json();
      listings = batchData.filter(r => r.code === 200).map(r => r.body);
    }

    // 3. Pedidos
    const ordersRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&sort=date_desc&limit=50`, { headers: mlHeaders });
    const ordersData = ordersRes.ok ? await ordersRes.json() : { results: [] };

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
        orders: ordersData.results || [],
        total_items: itemsData.paging?.total || listings.length
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
