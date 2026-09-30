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
// ⏱️ Petite pause entre les requêtes
// ─────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// 💾 Dernières statistiques connues
// ─────────────────────────────────────────────

const cachedStats = new Map();

// Empêche deux mises à jour de fonctionner en même temps
let updateInProgress = false;

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
// 📊 Récupérer les statistiques Roblox
// ─────────────────────────────────────────────

async function getRobloxStats(userId) {
    const key = String(userId);

    const oldStats = cachedStats.get(key) || {
        friends: null,
        followers: null,
        following: null
    };

    async function getRobloxCount(url, label, oldValue) {
        const maxAttempts = 4;

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
                        `⚠️ ${label} ${userId} : réponse Roblox invalide`
                    );

                } else if (response.status === 429) {
                    console.log(
                        `⚠️ ${label} ${userId} : HTTP 429 ` +
                        `(tentative ${attempt}/${maxAttempts})`
                    );

                    // Attente progressive en cas de rate limit
                    if (attempt < maxAttempts) {
                        const waitTime = 5000 * attempt;

                        console.log(
                            `⏳ Attente de ${waitTime / 1000}s avant nouvelle tentative...`
                        );

                        await sleep(waitTime);
                    }

                    continue;

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

            if (attempt < maxAttempts) {
                await sleep(4000);
            }
        }

        // Si Roblox refuse toutes les requêtes,
        // on conserve la dernière valeur connue.
        if (oldValue !== null && oldValue !== undefined) {
            console.log(
                `💾 ${label} ${userId} : ancienne valeur conservée (${oldValue})`
            );

            return oldValue;
        }

        // Aucune donnée disponible.
        return 0;
    }

    // 👥 Amis
    const friends = await getRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`,
        "Friends",
        oldStats.friends
    );

    await sleep(4000);

    // 👤 Followers
    const followers = await getRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`,
        "Followers",
        oldStats.followers
    );

    await sleep(4000);

    // ➡️ Following
    const following = await getRobloxCount(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`,
        "Following",
        oldStats.following
    );

    const stats = {
        friends,
        followers,
        following
    };

    cachedStats.set(key, stats);

    console.log(
        `📊 ${userId} → ${followers} followers`
    );

    return stats;
}

// ─────────────────────────────────────────────
// 🖼️ Récupérer l'avatar Roblox
// ─────────────────────────────────────────────

async function getAvatar(userId) {
    try {
        const response = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        return data.data?.[0]?.imageUrl || null;

    } catch (error) {
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
                );
        }

        console.log(
            `🔎 Récupération des statistiques de ${account.username}...`
        );

        const stats = await getRobloxStats(user.id);

        await sleep(3000);

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

    // Empêcher deux mises à jour simultanées
    if (updateInProgress) {
        console.log(
            "⏳ Une mise à jour est déjà en cours, nouvelle mise à jour ignorée."
        );

        return;
    }

    updateInProgress = true;

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
            const embed = await createAccountEmbed(account);

            embeds.push(embed);

            // Pause importante avant le compte suivant
            await sleep(5000);
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

    } finally {
        updateInProgress = false;
    }
}

// ─────────────────────────────────────────────
// 🤖 Démarrage du bot
// ─────────────────────────────────────────────

client.once("clientReady", async () => {
    console.log(
        `✅ LoricBot connecté en tant: ${client.user.tag}`
    );

    try {
        // Première mise à jour
        await updateSellingMessage();

        // 🔄 Mise à jour toutes les 2 minutes
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
