const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");

const config = require("./config.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// ======================================================
// ⚙️ CONFIG
// ======================================================

const UPDATE_INTERVAL = 5 * 60 * 1000;
const RETRY_DELAY = 5000;

let sellingMessage = null;
let updateRunning = false;

// ======================================================
// 💤 SLEEP
// ======================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================
// 🔐 MASQUAGE
// ======================================================

function mask(value, visible = 5) {
    if (!value) return "*****";

    value = String(value);

    if (value.length <= visible) {
        return value + "**";
    }

    return value.substring(0, visible) + "**";
}

// ======================================================
// 👤 RÉCUPÉRER USERNAME
// ======================================================

function getRobloxUsername(account) {
    if (typeof account === "string") {
        return account.trim();
    }

    if (account && typeof account.username === "string") {
        return account.username.trim();
    }

    if (account && typeof account.name === "string") {
        return account.name.trim();
    }

    if (account && typeof account.robloxUsername === "string") {
        return account.robloxUsername.trim();
    }

    return null;
}

// ======================================================
// 🌐 FETCH ROBLOX AVEC RETRY
// ======================================================

async function robloxFetch(url, options = {}) {
    while (true) {
        try {
            const response = await fetch(url, options);

            if (response.ok) {
                return response;
            }

            if (response.status === 429) {
                const retryAfter = response.headers.get("retry-after");

                let delay = RETRY_DELAY;

                if (retryAfter) {
                    const seconds = Number(retryAfter);

                    if (!isNaN(seconds)) {
                        delay = Math.max(seconds * 1000, RETRY_DELAY);
                    }
                }

                console.log(
                    `⚠️ Roblox HTTP 429 - nouvelle tentative dans ${Math.ceil(delay / 1000)}s`
                );

                await sleep(delay);
                continue;
            }

            if ([500, 502, 503, 504].includes(response.status)) {
                console.log(
                    `⚠️ Roblox HTTP ${response.status} - nouvelle tentative dans ${RETRY_DELAY / 1000}s`
                );

                await sleep(RETRY_DELAY);
                continue;
            }

            throw new Error(`Roblox HTTP ${response.status}`);
        } catch (error) {
            console.log(
                `⚠️ Erreur Roblox : ${error.message} - nouvelle tentative dans ${RETRY_DELAY / 1000}s`
            );

            await sleep(RETRY_DELAY);
        }
    }
}

// ======================================================
// 🔎 TROUVER USER ROBLOX
// ======================================================

async function getRobloxUser(username) {
    const response = await robloxFetch(
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

    const data = await response.json();

    if (!data.data || !data.data.length) {
        throw new Error(`Compte Roblox introuvable : ${username}`);
    }

    return data.data[0];
}

// ======================================================
// 📊 STATS ROBLOX
// ======================================================

async function getRobloxStats(userId) {
    const friendsResponse = await robloxFetch(
        `https://friends.roblox.com/v1/users/${userId}/friends/count`
    );

    const friendsData = await friendsResponse.json();

    await sleep(1000);

    const followersResponse = await robloxFetch(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`
    );

    const followersData = await followersResponse.json();

    await sleep(1000);

    const followingResponse = await robloxFetch(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`
    );

    const followingData = await followingResponse.json();

    return {
        friends: friendsData.count ?? 0,
        followers: followersData.count ?? 0,
        following: followingData.count ?? 0
    };
}

// ======================================================
// 🖼️ AVATAR ROBLOX
// ======================================================

async function getRobloxAvatar(userId) {
    const response = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );

    const data = await response.json();

    if (
        data.data &&
        data.data.length &&
        data.data[0].imageUrl
    ) {
        return data.data[0].imageUrl;
    }

    return null;
}

// ======================================================
// 🎮 RÉCUPÉRER UN COMPTE COMPLET
// ======================================================

async function getAccountData(account) {
    const username = getRobloxUsername(account);

    if (!username) {
        throw new Error("Username Roblox invalide dans config.js");
    }

    console.log(`🎮 Récupération de ${username}`);

    const user = await getRobloxUser(username);

    const stats = await getRobloxStats(user.id);

    const avatar = await getRobloxAvatar(user.id);

    console.log(`✅ Données récupérées pour ${username}`);

    return {
        label: account.name || username,

        username: user.name,

        displayName: user.displayName,

        userId: user.id,

        friends: stats.friends,
        followers: stats.followers,
        following: stats.following,

        avatar
    };
}

// ======================================================
// 🔄 RÉCUPÉRATION DE TOUS LES COMPTES
// ======================================================

async function getAllAccounts() {
    const accounts = [];

    for (let i = 0; i < config.robloxAccounts.length; i++) {
        const account = config.robloxAccounts[i];

        console.log(
            `🎮 Compte ${i + 1}/${config.robloxAccounts.length} : ${getRobloxUsername(account)}`
        );

        while (true) {
            try {
                const data = await getAccountData(account);

                accounts.push(data);

                break;
            } catch (error) {
                console.log(
                    `❌ Erreur pour ${getRobloxUsername(account)} : ${error.message}`
                );

                console.log(
                    `🔄 Nouvelle tentative dans ${RETRY_DELAY / 1000}s...`
                );

                await sleep(RETRY_DELAY);
            }
        }
    }

    return accounts;
}

// ======================================================
// 🎮 EMBED COMPTE ROBLOX
// ======================================================

function createAccountEmbed(account) {
    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${account.label}`)
        .setColor(0x2b2d31)

        .addFields(
            {
                name: "👤 Nom",
                value: `**${mask(account.displayName)}**`,
                inline: true
            },
            {
                name: "🏷️ Username",
                value: `**@${mask(account.username)}**`,
                inline: true
            },
            {
                name: "🆔 ID Roblox",
                value: `\`${mask(account.userId, 9)}\``,
                inline: false
            },
            {
                name: "👥 Amis",
                value: `**${account.friends.toLocaleString("fr-FR")}**`,
                inline: true
            },
            {
                name: "👤 Followers",
                value: `**${account.followers.toLocaleString("fr-FR")}**`,
                inline: true
            },
            {
                name: "➡️ Following",
                value: `**${account.following.toLocaleString("fr-FR")}**`,
                inline: true
            }
        )
        .setFooter({
            text: "LoricBot • Informations Roblox"
        })
        .setTimestamp();

    if (account.avatar) {
        embed.setThumbnail(account.avatar);
    }

    return embed;
}

// ======================================================
// 💰 PRIX
// ======================================================

function createPricesEmbed() {
    return new EmbedBuilder()
        .setTitle("💰 PRICES FOR ACCOUNTS")
        .setColor(0x57f287)
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

// ======================================================
// 🛒 EMBED PRINCIPAL
// ======================================================

function createHeaderEmbed() {
    return new EmbedBuilder()
        .setTitle("🛒 Selling ACC")
        .setDescription(
            "🎮 **Comptes Roblox disponibles** ━━━━━━━━━━━━━━━━━━━━\n\n" +
            "📊 Les informations sont récupérées automatiquement.\n" +
            "🔄 Mise à jour toutes les **5 minutes**.\n" +
            "🔐 Certaines informations sont volontairement masquées."
        )
        .setColor(0x5865f2);
}

// ======================================================
// 📨 TROUVER L'ANCIEN MESSAGE
// ======================================================

async function findExistingSellingMessage(channel) {
    try {
        const messages = await channel.messages.fetch({
            limit: 100
        });

        const existing = messages.find(message => {
            if (message.author.id !== client.user.id) {
                return false;
            }

            if (!message.embeds || !message.embeds.length) {
                return false;
            }

            return message.embeds.some(embed =>
                embed.title === "🛒 Selling ACC"
            );
        });

        return existing || null;
    } catch (error) {
        console.log(
            `❌ Impossible de chercher le message existant : ${error.message}`
        );

        return null;
    }
}

// ======================================================
// 🔄 ACTUALISER LE MESSAGE
// ======================================================

async function updateSellingMessage() {
    if (updateRunning) {
        console.log("⏳ Une mise à jour est déjà en cours.");
        return;
    }

    updateRunning = true;

    try {
        const channelId = config.sellingChannelId;

        if (!channelId) {
            throw new Error("sellingChannelId manquant dans config.js");
        }

        const channel = await client.channels.fetch(channelId);

        if (!channel) {
            throw new Error("Salon Selling ACC introuvable.");
        }

        console.log("🔄 Mise à jour des comptes Roblox...");

        const accounts = await getAllAccounts();

        console.log("✅ Tous les comptes Roblox ont été récupérés.");

        const embeds = [
            createHeaderEmbed(),
            ...accounts.map(createAccountEmbed),
            createPricesEmbed()
        ];

        // Recherche du message existant
        if (!sellingMessage) {
            sellingMessage = await findExistingSellingMessage(channel);
        }

        // Si aucun message n'existe → création UNE SEULE FOIS
        if (!sellingMessage) {
            console.log("📨 Aucun message existant. Création...");

            sellingMessage = await channel.send({
                embeds
            });

            console.log(
                `✅ Message Selling ACC créé : ${sellingMessage.id}`
            );
        } else {
            // Sinon → MODIFICATION du même message
            console.log(
                `✏️ Modification du message Selling ACC : ${sellingMessage.id}`
            );

            await sellingMessage.edit({
                embeds
            });

            console.log("✅ Message Selling ACC mis à jour.");
        }

    } catch (error) {
        console.log(
            `❌ Erreur mise à jour Selling ACC : ${error.message}`
        );
    } finally {
        updateRunning = false;
    }
}

// ======================================================
// 🎫 PANEL TICKET
// ======================================================

async function setupTicketPanel() {
    try {
        if (!config.ticketChannelId) return;

        const channel = await client.channels.fetch(
            config.ticketChannelId
        );

        const messages = await channel.messages.fetch({
            limit: 50
        });

        const exists = messages.some(
            message =>
                message.author.id === client.user.id &&
                message.embeds.some(
                    embed => embed.title === "🎫 Tickets"
                )
        );

        if (exists) {
            console.log("🎫 Panel ticket déjà présent.");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🎫 Tickets")
            .setDescription(
                "Besoin d'aide ?\n\n" +
                "Clique sur le bouton ci-dessous pour créer un ticket."
            )
            .setColor(0x5865f2);

        const button = new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("Créer un ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        console.log("✅ Panel ticket créé.");
    } catch (error) {
        console.log(
            `❌ Erreur panel ticket : ${error.message}`
        );
    }
}

// ======================================================
// 📜 PANEL RÈGLEMENT
// ======================================================

async function setupRulesPanel() {
    try {
        if (!config.rulesChannelId) return;

        const channel = await client.channels.fetch(
            config.rulesChannelId
        );

        const messages = await channel.messages.fetch({
            limit: 50
        });

        const exists = messages.some(
            message =>
                message.author.id === client.user.id &&
                message.embeds.some(
                    embed => embed.title === "📜 Règlement"
                )
        );

        if (exists) {
            console.log("📜 Panel règlement déjà présent.");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("📜 Règlement")
            .setDescription(
                "Merci de lire et respecter le règlement du serveur.\n\n" +
                "Clique sur le bouton ci-dessous pour accepter le règlement."
            )
            .setColor(0x57f287);

        const button = new ButtonBuilder()
            .setCustomId("accept_rules")
            .setLabel("J'accepte le règlement")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        console.log("✅ Panel règlement créé.");
    } catch (error) {
        console.log(
            `❌ Erreur panel règlement : ${error.message}`
        );
    }
}

// ======================================================
// 🟢 BOT PRÊT
// ======================================================

client.once("clientReady", async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    await setupTicketPanel();
    await setupRulesPanel();

    // Première création / mise à jour
    await updateSellingMessage();

    // Puis toutes les 5 minutes
    setInterval(async () => {
        await updateSellingMessage();
    }, UPDATE_INTERVAL);
});

// ======================================================
// 🔘 BOUTONS
// ======================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    // ==========================
    // 📜 RÈGLEMENT
    // ==========================

    if (interaction.customId === "accept_rules") {
        try {
            const roleId = config.verifiedRoleId;

            if (!roleId) {
                return interaction.reply({
                    content: "❌ Le rôle vérifié n'est pas configuré.",
                    ephemeral: true
                });
            }

            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                return interaction.reply({
                    content: "❌ Rôle introuvable.",
                    ephemeral: true
                });
            }

            await interaction.member.roles.add(role);

            await interaction.reply({
                content: "✅ Tu as accepté le règlement.",
                ephemeral: true
            });
        } catch (error) {
            console.log(
                `❌ Erreur rôle : ${error.message}`
            );

            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ Impossible de donner le rôle.",
                    ephemeral: true
                });
            }
        }

        return;
    }

    // ==========================
    // 🎫 TICKET
    // ==========================

    if (interaction.customId === "create_ticket") {
        try {
            const guild = interaction.guild;

            const existing = guild.channels.cache.find(
                channel =>
                    channel.name ===
                    `ticket-${interaction.user.username.toLowerCase()}`
            );

            if (existing) {
                return interaction.reply({
                    content: `❌ Tu as déjà un ticket : ${existing}`,
                    ephemeral: true
                });
            }

            const channel = await guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("🎫 Ticket")
                .setDescription(
                    `Bonjour ${interaction.user},\n\n` +
                    "Explique ton problème ici. Un membre du staff viendra t'aider."
                )
                .setColor(0x5865f2);

            await channel.send({
                content: `${interaction.user}`,
                embeds: [embed]
            });

            await interaction.reply({
                content: `✅ Ton ticket a été créé : ${channel}`,
                ephemeral: true
            });
        } catch (error) {
            console.log(
                `❌ Erreur création ticket : ${error.message}`
            );

            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ Impossible de créer le ticket.",
                    ephemeral: true
                });
            }
        }
    }
});

// ======================================================
// 🔑 LOGIN
// ======================================================

if (!config.token) {
    console.error(
        "❌ DISCORD_TOKEN manquant dans les variables d'environnement."
    );

    process.exit(1);
}

client.login(config.token);
