```js
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
// ⏱️ Petite pause
// ─────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// 💾 Dernières statistiques connues
// ─────────────────────────────────────────────

const cachedStats = new Map();

// ─────────────────────────────────────────────
// 🔎 Rechercher un utilisateur Roblox
// ─────────────────────────────────────────────

async function getRobloxUser(username) {
    const response = await fetch(
        "https://users.roblox.com/v1/usernames/users",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                usernames: [username],
                excludeBannedUsers: false
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            `Roblox Users API : ${response.status}`
        );
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
        return null;
    }

    return data.data[0];
}

// ─────────────────────────────────────────────
// 📊 Requête sécurisée pour une statistique
// ─────────────────────────────────────────────

async function fetchRobloxCount(
    url,
    label,
    userId,
    oldValue
) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/json"
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (typeof data.count === "number") {
                    console.log(
                        `✅ ${label} ${userId} : ${data.count}`
                    );

                    return data.count;
                }

                console.log(
                    `⚠️ ${label} ${userId} : réponse invalide`
                );

            } else {
                console.log(
                    `⚠️ ${label} ${userId} : HTTP ${response.status} ` +
                    `(tentative ${attempt}/${maxAttempts})`
                );
            }

        } catch (error) {
            console.log(
                `⚠️ ${label} ${userId} : erreur réseau ` +
                `(tentative ${attempt}/${maxAttempts})`
            );
        }

        // Attendre avant de réessayer
        if (attempt < maxAttempts) {
            await sleep(2000 * attempt);
        }
    }

    // IMPORTANT :
    // On garde l'ancienne valeur au lieu de mettre 0.
    return oldValue;
}

// ─────────────────────────────────────────────
// 📊 Récupérer les statistiques Roblox
// ─────────────────────────────────────────────

async function getRobloxStats(userId) {
    const key = String(userId);

    const oldStats = cachedStats.get(key) || {
        friends: null,
        followers: null,
        following: null
    };

    const stats = {
        friends: oldStats.friends,
        followers: oldStats.followers,
        following: oldStats.following
    };

    // ─────────────────────────────────────────
    // 👥 Amis
    // ─────────────────────────────────────────

    stats.friends = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`,
        "Friends",
        userId,
        oldStats.friends
    );

    await sleep(2000);

    // ─────────────────────────────────────────
    // 👤 Followers
    // ─────────────────────────────────────────

    stats.followers = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`,
        "Followers",
        userId,
        oldStats.followers
    );

    await sleep(2000);

    // ─────────────────────────────────────────
    // ➡️ Following
    // ─────────────────────────────────────────

    stats.following = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`,
        "Following",
        userId,
        oldStats.following
    );

    // ─────────────────────────────────────────
    // Si aucune valeur n'a jamais été récupérée
    // ─────────────────────────────────────────

    if (stats.friends === null) {
        stats.friends = "--";
    }

    if (stats.followers === null) {
        stats.followers = "--";
    }

    if (stats.following === null) {
        stats.following = "--";
    }

    // Sauvegarder les dernières valeurs connues
    cachedStats.set(key, stats);

    return stats;
}

// ─────────────────────────────────────────────
// 🖼️ Récupérer l'avatar Roblox
// ─────────────────────────────────────────────

async function getAvatar(userId) {
    try {
        const response = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
            {
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            console.log(
                `⚠️ Avatar API : ${response.status} pour ${userId}`
            );

            return null;
        }

        const data = await response.json();

        return data.data?.[0]?.imageUrl || null;

    } catch (error) {
        console.log(
            `⚠️ Erreur Avatar API pour ${userId}`
        );

        return null;
    }
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
                )
                .setFooter({
                    text: "LoricBot • Roblox"
                });
        }

        console.log(
            `🔎 Récupération des statistiques de ${account.username}...`
        );

        const stats = await getRobloxStats(user.id);

        // Petite pause avant l'avatar
        await sleep(1000);

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
                    value:
                        typeof stats.friends === "number"
                            ? `**${stats.friends.toLocaleString("fr-FR")}**`
                            : `**${stats.friends}**`,
                    inline: true
                },
                {
                    name: "👤 Followers",
                    value:
                        typeof stats.followers === "number"
                            ? `**${stats.followers.toLocaleString("fr-FR")}**`
                            : `**${stats.followers}**`,
                    inline: true
                },
                {
                    name: "➡️ Following",
                    value:
                        typeof stats.following === "number"
                            ? `**${stats.following.toLocaleString("fr-FR")}**`
                            : `**${stats.following}**`,
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

        // Traiter les comptes un par un
        for (const account of config.robloxAccounts) {
            console.log(
                `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            );

            console.log(
                `🎮 Compte : ${account.username}`
            );

            const embed = await createAccountEmbed(account);

            embeds.push(embed);

            // Pause entre les comptes
            await sleep(2000);
        }

        // Ajouter les prix
        embeds.push(createPricesEmbed());

        const content =
            "# 🛒 Selling ACC\n\n" +
            "🎮 **Comptes Roblox disponibles**\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            "📊 Les informations sont récupérées automatiquement.\n" +
            "🔄 Mise à jour toutes les **2 minutes**.\n\n" +
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

            console.log(
                "✅ Message Roblox mis à jour !"
            );

        } else {
            await channel.send({
                content,
                embeds
            });

            console.log(
                "✅ Message Roblox créé !"
            );
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
        // Première mise à jour
        await updateSellingMessage();

        // ─────────────────────────────────────────
        // 🔄 Mise à jour toutes les 2 minutes
        // ─────────────────────────────────────────

        setInterval(async () => {
            try {
                await updateSellingMessage();

            } catch (error) {
                console.error(
                    "❌ Erreur pendant la mise à jour :",
                    error
                );
            }

        }, 2 * 60 * 1000);

        console.log(
            "🔄 Mise à jour Selling ACC toutes les 2 minutes activée !"
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
```

Avec cette version, si Roblox renvoie `429`, `500`, une erreur réseau, etc., le bot **ne mettra plus automatiquement les followers à `0`**. Il conservera la dernière valeur connue ou affichera `--` s'il n'en a jamais obtenu.

Tu peux remplacer directement ton ancien `index.js` par celui-ci.
