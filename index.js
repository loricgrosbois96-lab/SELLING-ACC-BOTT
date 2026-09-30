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
    const response = await fetch(
        "https://users.roblox.com/v1/usernames/users",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usernames: [username],
                excludeBannedUsers: false
            })
        }
    );

    if (!response.ok) {
        throw new Error(`Roblox Users API : ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
        return null;
    }

    return data.data[0];
}

// ─────────────────────────────────────────────
// 📊 Récupérer les statistiques Roblox
// ─────────────────────────────────────────────

async function getRobloxStats(userId) {
    const [friends, followers, following] = await Promise.all([
        fetch(
            `https://friends.roblox.com/v1/users/${userId}/friends/count`
        ),
        fetch(
            `https://friends.roblox.com/v1/users/${userId}/followers/count`
        ),
        fetch(
            `https://friends.roblox.com/v1/users/${userId}/followings/count`
        )
    ]);

    // Afficher l'erreur exacte pour savoir quelle API bloque
    if (!friends.ok) {
        throw new Error(`Friends API : ${friends.status}`);
    }

    if (!followers.ok) {
        throw new Error(`Followers API : ${followers.status}`);
    }

    if (!following.ok) {
        throw new Error(`Following API : ${following.status}`);
    }

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

    if (!response.ok) {
        return null;
    }

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
                .setDescription(
                    `Le compte Roblox **${account.username}** est introuvable.`
                );
        }

        const stats = await getRobloxStats(user.id);
        const avatar = await getAvatar(user.id);

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${account.name}`)
            .setDescription(
                `👤 **${maskLastTwo(user.displayName)}**\n` +
                `🏷️ @${maskLastTwo(user.name)}`
            )
            .addFields(
                {
                    name: "🆔 ID Roblox",
                    value: `\`${maskLastTwo(user.id)}\``,
                    inline: true
                },
                {
                    name: "👥 Amis",
                    value: `**${stats.friends.toLocaleString("fr-FR")}**`,
                    inline: true
                },
                {
                    name: "👤 Followers",
                    value: `**${stats.followers.toLocaleString("fr-FR")}**`,
                    inline: true
                },
                {
                    name: "➡️ Following",
                    value: `**${stats.following.toLocaleString("fr-FR")}**`,
                    inline: true
                }
            )
            .setFooter({
                text: "LoricBot • Informations Roblox"
            })
            .setTimestamp();

        if (avatar) {
            embed.setThumbnail(avatar);
        }

        return embed;

    } catch (error) {
        console.error(
            `❌ Erreur avec ${account.username}:`,
            error
        );

        return new EmbedBuilder()
            .setTitle(`⚠️ ${account.name}`)
            .setDescription(
                `Impossible de récupérer les informations de **${account.username}** pour le moment.`
            )
            .setFooter({
                text: "LoricBot • Roblox"
            });
    }
}

// ─────────────────────────────────────────────
// 💰 Prix des comptes
// ─────────────────────────────────────────────

function createPricesEmbed() {
    return new EmbedBuilder()
        .setTitle("💰 PRICES FOR ACCOUNTS")
        .setColor(0x57F287)
        .addFields(
            {
                name: "200 FOLLOWERS ACC",
                value:
                    "• 1–2 ADM VAL\n" +
                    "• 10 MM2 VAL\n" +
                    "• 100 ROBUX",
                inline: true
            },
            {
                name: "500 FOLLOWERS ACC",
                value:
                    "• 5 ADM VAL\n" +
                    "• 50 MM2 VAL\n" +
                    "• 250 ROBUX",
                inline: true
            },
            {
                name: "1K FOLLOWERS ACC",
                value:
                    "• 10 ADM VAL\n" +
                    "• 100 MM2 VAL\n" +
                    "• 500 ROBUX",
                inline: true
            },
            {
                name: "2K FOLLOWERS ACC",
                value:
                    "• 20 ADM VAL\n" +
                    "• 200 MM2 VAL\n" +
                    "• 1,000 ROBUX",
                inline: true
            },
            {
                name: "5K FOLLOWERS ACC",
                value:
                    "• 50 ADOPT ME VAL\n" +
                    "• 500 MM2 VAL\n" +
                    "• 5,000 ROBUX",
                inline: true
            },
            {
                name: "10K+ FOLLOWERS ACC",
                value:
                    "• 100+ ADM VAL\n" +
                    "• 1K+ MM2 VAL\n" +
                    "• 10K+ ROBUX",
                inline: true
            }
        )
        .setFooter({
            text: "LoricBot • Prices"
        });
}

// ─────────────────────────────────────────────
// 🛒 Mettre à jour le salon Selling ACC
// ─────────────────────────────────────────────

async function updateSellingMessage() {
    try {
        const channel = await client.channels.fetch(
            config.sellingChannelId
        );

        if (!channel) {
            console.log("❌ Salon introuvable.");
            return;
        }

        const embeds = [];

        // Comptes Roblox
        for (const account of config.robloxAccounts) {
            const embed = await createAccountEmbed(account);
            embeds.push(embed);
        }

        // Prix
        const pricesEmbed = createPricesEmbed();
        embeds.push(pricesEmbed);

        const content =
            "# 🛒 Selling ACC\n\n" +
            "🎮 **Comptes Roblox disponibles**\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            "📊 Les informations sont récupérées automatiquement.\n" +
            "🔄 Mise à jour toutes les **30 secondes**.\n\n" +
            "🔐 Certaines informations sont volontairement masquées.";

        const messages = await channel.messages.fetch({
            limit: 50
        });

        let message = messages.find(
            msg =>
                msg.author.id === client.user.id &&
                msg.content.includes("Selling ACC")
        );

        if (message) {
            await message.edit({
                content,
                embeds
            });

            console.log("✅ Message Roblox mis à jour !");
        } else {
            await channel.send({
                content,
                embeds
            });

            console.log("✅ Message Roblox créé !");
        }

    } catch (error) {
        console.error(
            "❌ Erreur pendant la mise à jour :",
            error
        );
    }
}

// ─────────────────────────────────────────────
// 🤖 Démarrage du bot
// ─────────────────────────────────────────────

client.once("ready", async () => {
    console.log(
        `✅ LoricBot connecté en tant que ${client.user.tag}`
    );

    try {
        await updateSellingMessage();

        // 🔄 Mise à jour toutes les 30 secondes
        setInterval(async () => {
            try {
                await updateSellingMessage();
            } catch (error) {
                console.error(
                    "❌ Erreur pendant la mise à jour :",
                    error
                );
            }
        }, 30 * 1000);

        console.log(
            "🔄 Mise à jour Selling ACC toutes les 30 secondes activée !"
        );

    } catch (error) {
        console.error(
            "❌ Erreur au démarrage :",
            error
        );
    }
});

// ─────────────────────────────────────────────
// 🔑 Connexion Discord
// ─────────────────────────────────────────────

client.login(config.token);
