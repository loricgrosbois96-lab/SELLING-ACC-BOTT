const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const config = require("./config");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ─────────────────────────────────────────────
// 🔒 Masquer les 2 derniers caractères
// ─────────────────────────────────────────────

function maskLastTwo(value) {
    const text = String(value);
    if (text.length <= 2) return "**";
    return text.slice(0, -2) + "**";
}

// ─────────────────────────────────────────────
// 🔎 Rechercher un utilisateur Roblox
// ─────────────────────────────────────────────

async function getRobloxUser(username) {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });

    if (!response.ok) throw new Error(`Roblox Users API : ${response.status}`);

    const data = await response.json();
    if (!data.data || data.data.length === 0) return null;
    return data.data[0];
}

// ─────────────────────────────────────────────
// 📊 Récupérer les statistiques Roblox
// ─────────────────────────────────────────────

async function getRobloxStats(userId) {
    const [friends, followers, following] = await Promise.all([
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`)
    ]);

    if (!friends.ok || !followers.ok || !following.ok)
        throw new Error("Erreur lors de la récupération des statistiques Roblox.");

    const friendsData = await friends.json();
    const followersData = await followers.json();
    const followingData = await following.json();

    return {
        friends: friendsData.count ?? 0,
        followers: followersData.count ?? 0,
        following: followingData.count ?? 0
    };
}

// ─────────────────────────────────────────────
// 🖼️ Récupérer l'avatar Roblox
// ─────────────────────────────────────────────

async function getAvatar(userId) {
    const response = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.imageUrl || null;
}

// ─────────────────────────────────────────────
// 🎮 Créer l'embed d'un compte
// ─────────────────────────────────────────────

async function createAccountEmbed(account) {
    try {
        const user = await getRobloxUser(account.username);
        if (!user) {
            return new EmbedBuilder()
                .setTitle(`❌ ${account.name}`)
                .setDescription(`Le compte Roblox **${account.username}** est introuvable.`);
        }

        const stats = await getRobloxStats(user.id);
        const avatar = await getAvatar(user.id);

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${account.name}`)
            .setDescription(
                `👤 **${maskLastTwo(user.displayName)}**\n🏷️ @${maskLastTwo(user.name)}`
            )
            .addFields(
                { name: "🆔 ID Roblox", value: `\`${maskLastTwo(user.id)}\``, inline: true },
                { name: "👥 Amis", value: `**${stats.friends.toLocaleString("fr-FR")}**`, inline: true },
                { name: "👤 Followers", value: `**${stats.followers.toLocaleString("fr-FR")}**`, inline: true },
                { name: "➡️ Following", value: `**${stats.following.toLocaleString("fr-FR")}**`, inline: true }
            )
            .setFooter({ text: "LoricBot • Informations Roblox" })
            .setTimestamp();

        if (avatar) embed.setThumbnail(avatar);
        return embed;
    } catch (error) {
        console.error(`❌ Erreur avec ${account.username}:`, error);
        return new EmbedBuilder()
            .setTitle(`⚠️ ${account.name}`)
            .setDescription(`Impossible de récupérer les informations de **${account.username}** pour le moment.`)
            .setFooter({ text: "LoricBot • Roblox" });
    }
}

// ─────────────────────────────────────────────
// 🛒 Mettre à jour le salon Selling ACC
// ─────────────────────────────────────────────

async function updateSellingMessage() {
    const channel = await client.channels.fetch(config.sellingChannelId);
    if (!channel) return console.log("❌ Salon introuvable.");

    const embeds = [];
    for (const account of config.robloxAccounts) {
        const embed = await createAccountEmbed(account);
        embeds.push(embed);
    }

    const content =
        "# 🛒 Selling ACC\n\n" +
        "🎮 **Comptes Roblox disponibles**\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "📊 Les informations sont récupérées automatiquement.\n" +
        "🔄 Mise à jour toutes les **30 secondes**.\n\n" +
        "🔐 Certaines informations sont volontairement masquées.";

    const messages = await channel.messages.fetch({ limit: 50 });
    let message = messages.find(
        msg => msg.author.id === client.user.id && msg.content.includes("Selling ACC")
    );

    if (message) {
        await message.edit({ content, embeds });
        console.log("✅ Message Roblox mis à jour !");
    } else {
        await channel.send({ content, embeds });
        console.log("✅ Message Roblox créé !");
    }
}

// ─────────────────────────────────────────────
// 🤖 Démarrage du bot
// ─────────────────────────────────────────────

client.once("ready", async () => {
    console.log(`✅ LoricBot connecté en tant que ${client.user.tag}`);

    try {
        await updateSellingMessage();

        // 🔄 Mise à jour toutes les 30 secondes
        setInterval(async () => {
            try {
                await updateSellingMessage();
            } catch (error) {
                console.error("❌ Erreur pendant la mise à jour :", error);
            }
        }, 30 * 1000);

        console.log("🔄 Mise à jour Selling ACC toutes les 30 secondes activée !");
    } catch (error) {
        console.error("❌ Erreur au démarrage :", error);
    }
});

client.login(config.token);
