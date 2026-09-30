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

    if (text.length <= 2) {
        return "**";
    }

    return text.slice(0, -2) + "**";
}

// ─────────────────────────────────────────────
// ⏱️ Pause
// ─────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// 💾 Cache
// ─────────────────────────────────────────────

const cachedStats = new Map();

// ─────────────────────────────────────────────
// 🔎 Rechercher utilisateur Roblox
// ─────────────────────────────────────────────

async function getRobloxUser(username) {
    try {
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

    } catch (error) {
        console.error(
            `❌ Erreur recherche ${username}:`,
            error.message
        );

        throw error;
    }
}

// ─────────────────────────────────────────────
// 📊 Récupérer une statistique Roblox
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
                    `(${attempt}/${maxAttempts})`
                );
            }

        } catch (error) {
            console.log(
                `⚠️ ${label} ${userId} : erreur réseau ` +
                `(${attempt}/${maxAttempts})`
            );
        }

        if (attempt < maxAttempts) {
            await sleep(2000 * attempt);
        }
    }

    // IMPORTANT :
    // On conserve l'ancienne valeur.
    // On ne met jamais 0 automatiquement.
    if (oldValue !== null && oldValue !== undefined) {
        console.log(
            `💾 ${label} ${userId} : ancienne valeur conservée (${oldValue})`
        );

        return oldValue;
    }

    console.log(
        `⚠️ ${label} ${userId} : aucune valeur disponible`
    );

    return "--";
}

// ─────────────────────────────────────────────
// 📊 Statistiques Roblox
// ─────────────────────────────────────────────

async function getRobloxStats(userId) {
    const key = String(userId);

    const oldStats = cachedStats.get(key) || {
        friends: null,
        followers: null,
        following: null
    };

    console.log(
        `📊 Récupération statistiques pour ${userId}`
    );

    // 👥 Amis
    const friends = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`,
        "Friends",
        userId,
        oldStats.friends
    );

    await sleep(2000);

    // 👤 Followers
    const followers = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`,
        "Followers",
        userId,
        oldStats.followers
    );

    await sleep(2000);

    // ➡️ Following
    const following = await fetchRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`,
        "Following",
        userId,
        oldStats.following
    );

    const stats = {
        friends,
        followers,
        following
    };

    cachedStats.set(key, stats);

    return stats;
}

// ─────────────────────────────────────────────
// 🖼️ Avatar Roblox
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
                `⚠️ Avatar API : ${response.status}`
            );

            return null;
        }

        const data = await response.json();

        return data.data?.[0]?.imageUrl || null;

    } catch (error) {
        console.log(
            `⚠️ Impossible de récupérer l'avatar ${userId}`
        );

        return null;
    }
}

// ─────────────────────────────────────────────
// 🔢 Formater statistique
// ─────────────────────────────────────────────

function formatStat(value) {
    if (typeof value === "number") {
        return value.toLocaleString("fr-FR");
    }

    return String(value);
}

// ─────────────────────────────────────────────
// 🎮 Créer embed compte
// ─────────────────────────────────────────────

async function createAccountEmbed(account) {
    try {
        console.log("");
        console.log(
            `🔎 Traitement de ${account.username}`
        );

        const user = await getRobloxUser(
            account.username
        );

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

        const stats = await getRobloxStats(
            user.id
        );

        await sleep(1000);

        const avatar = await getAvatar(
            user.id
        );

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
                    value: `**${formatStat(stats.friends)}**`,
                    inline: true
                },
                {
                    name: "👤 Followers",
                    value: `**${formatStat(stats.followers)}**`,
                    inline: true
                },
                {
                    name: "➡️ Following",
                    value: `**${formatStat(stats.following)}**`,
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
// 💰 Prix
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
// 🛒 Mise à jour Selling ACC
// ─────────────────────────────────────────────

async function updateSellingMessage() {
    try {
        console.log("");
        console.log("════════════════════════════════");
        console.log("🔄 Mise à jour Selling ACC");
        console.log("════════════════════════════════");

        const channel = await client.channels.fetch(
            config.sellingChannelId
        );

        if (!channel) {
            console.log(
                "❌ Salon introuvable."
            );

            return;
        }

        const embeds = [];

        for (const account of config.robloxAccounts) {
            const embed = await createAccountEmbed(
                account
            );

            embeds.push(embed);

            // Pause entre les comptes
            await sleep(2000);
        }

        // Ajouter les prix
        embeds.push(
            createPricesEmbed()
        );

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

        const message = messages.find(
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
// 🤖 Bot prêt
// ─────────────────────────────────────────────

client.once("ready", async () => {
    console.log(
        `✅ LoricBot connecté en tant que ${client.user.tag}`
    );

    try {
        // Première mise à jour
        await updateSellingMessage();

        // Toutes les 2 minutes
        setInterval(
            async () => {
                try {
                    await updateSellingMessage();
                } catch (error) {
                    console.error(
                        "❌ Erreur update :",
                        error
                    );
                }
            },
            2 * 60 * 1000
        );

        console.log(
            "🔄 Mise à jour toutes les 2 minutes activée !"
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
