const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const config = require("./config");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ======================================================
// VARIABLES
// ======================================================

const cachedStats = new Map();
let updateInProgress = false;

// Temps minimum entre deux mises à jour Roblox
const ROBLOX_UPDATE_INTERVAL = 10 * 60 * 1000;

// Temps pendant lequel on évite de refaire une requête
// après un RATE_LIMIT
const robloxCooldown = new Map();

// ======================================================
// 🎫 TICKETS
// ======================================================

async function sendTicketPanel() {
    try {
        const channel = await client.channels.fetch(
            config.ticketChannelId
        );

        if (!channel) {
            console.log("❌ Salon tickets introuvable.");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🎫 Support")
            .setDescription(
                "Besoin d'aide ?\n\n" +
                "Clique sur le bouton ci-dessous pour créer un ticket.\n\n" +
                "📌 Un membre du staff viendra ensuite t'aider."
            )
            .setColor(0x5865F2)
            .setFooter({
                text: "Support • Tickets"
            });

        const button = new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("🎫 Créer un ticket")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        console.log("✅ Panel tickets envoyé.");
    } catch (error) {
        console.error("❌ Erreur panel tickets :", error);
    }
}

// ======================================================
// 📜 RÈGLEMENT
// ======================================================

async function sendRulesPanel() {
    try {
        const channel = await client.channels.fetch(
            config.rulesChannelId
        );

        if (!channel) {
            console.log("❌ Salon règlement introuvable.");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("📜 Règlement du serveur")
            .setDescription(
                "Bienvenue sur le serveur !\n\n" +
                "Merci de lire attentivement le règlement avant de continuer.\n\n" +

                "**1️⃣ Respect**\n" +
                "Respecte les autres membres et le staff.\n\n" +

                "**2️⃣ Pas de spam**\n" +
                "Évite le flood, le spam et les messages répétitifs.\n\n" +

                "**3️⃣ Pas de harcèlement**\n" +
                "Les insultes, menaces et comportements visant à nuire aux autres membres sont interdits.\n\n" +

                "**4️⃣ Pas de publicité**\n" +
                "Aucune publicité ou promotion sans autorisation du staff.\n\n" +

                "**5️⃣ Pas d'arnaque**\n" +
                "Les arnaques et tentatives de fraude sont interdites.\n\n" +

                "**6️⃣ Utilise les bons salons**\n" +
                "Merci d'utiliser chaque salon pour son utilisation prévue.\n\n" +

                "**7️⃣ Règles Discord**\n" +
                "Tu dois également respecter les règles et conditions d'utilisation de Discord.\n\n" +

                "━━━━━━━━━━━━━━━━━━━━\n\n" +

                "✅ En cliquant sur **Accepter le règlement**, " +
                "tu confirmes avoir lu et accepté le règlement du serveur."
            )
            .setColor(0x5865F2)
            .setFooter({
                text: "Vérification • Merci de respecter le règlement"
            })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId("accept_rules")
            .setLabel("Accepter le règlement")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        console.log("✅ Panel règlement envoyé.");
    } catch (error) {
        console.error("❌ Erreur panel règlement :", error);
    }
}

// ======================================================
// 🎮 ROBLOX
// ======================================================

async function getRobloxUser(username) {
    try {
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

        if (response.status === 429) {
            console.log(
                `⚠️ Roblox limite la recherche du compte ${username}.`
            );
            return null;
        }

        if (!response.ok) {
            throw new Error(`Roblox HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.data || !data.data.length) {
            return null;
        }

        return data.data[0];
    } catch (error) {
        console.error(
            `❌ Erreur utilisateur Roblox ${username}:`,
            error
        );

        return null;
    }
}

// ======================================================
// 📊 STATS ROBLOX
// ======================================================

async function getRobloxStats(userId) {

    // Si Roblox nous a récemment limité pour cet utilisateur,
    // on utilise directement le cache.
    const cooldownUntil = robloxCooldown.get(userId);

    if (cooldownUntil && Date.now() < cooldownUntil) {
        console.log(
            `⏳ Roblox cooldown pour ${userId}, utilisation du cache.`
        );

        return cachedStats.get(userId) || null;
    }

    const endpoints = {
        friends:
            `https://friends.roblox.com/v1/users/${userId}/friends/count`,

        followers:
            `https://friends.roblox.com/v1/users/${userId}/followers/count`,

        following:
            `https://friends.roblox.com/v1/users/${userId}/followings/count`
    };

    const results = {};

    try {
        for (const [key, url] of Object.entries(endpoints)) {

            const response = await fetch(url);

            // ==================================================
            // 🔴 RATE LIMIT
            // ==================================================

            if (response.status === 429) {

                const retryAfter =
                    response.headers.get("retry-after");

                let cooldown = 10 * 60 * 1000;

                if (retryAfter) {
                    const seconds = Number(retryAfter);

                    if (!Number.isNaN(seconds)) {
                        cooldown = Math.max(
                            seconds * 1000,
                            30 * 1000
                        );
                    }
                }

                robloxCooldown.set(
                    userId,
                    Date.now() + cooldown
                );

                console.log(
                    `⚠️ Roblox RATE_LIMIT pour ${userId}. ` +
                    `Pause pendant ${Math.ceil(cooldown / 1000)} secondes.`
                );

                // On garde les anciennes statistiques
                return cachedStats.get(userId) || null;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            results[key] = await response.json();
        }

        const stats = {
            friends: results.friends.count,
            followers: results.followers.count,
            following: results.following.count
        };

        // Sauvegarde dans le cache
        cachedStats.set(userId, stats);

        // Si la requête fonctionne à nouveau,
        // on retire le cooldown.
        robloxCooldown.delete(userId);

        return stats;

    } catch (error) {

        console.error(
            `❌ Erreur stats Roblox ${userId} :`,
            error.message
        );

        // En cas d'erreur temporaire,
        // on garde les anciennes statistiques.
        return cachedStats.get(userId) || null;
    }
}

// ======================================================
// 🖼️ AVATAR ROBLOX
// ======================================================

async function getRobloxAvatar(userId) {
    try {
        const url =
            `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
            `?userIds=${userId}` +
            `&size=150x150` +
            `&format=Png` +
            `&isCircular=false`;

        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        return data.data?.[0]?.imageUrl || null;

    } catch (error) {
        console.error(
            "❌ Erreur avatar Roblox :",
            error
        );

        return null;
    }
}

// ======================================================
// 📦 RÉCUPÉRATION DES COMPTES
// ======================================================

async function getAccountData(account) {

    const user = await getRobloxUser(account.username);

    if (!user) {
        return {
            ...account,
            userId: null,
            displayName: account.username,
            stats: null,
            avatar: null
        };
    }

    const stats = await getRobloxStats(user.id);
    const avatar = await getRobloxAvatar(user.id);

    return {
        ...account,
        userId: user.id,
        displayName: user.displayName,
        stats: stats || cachedStats.get(user.id) || null,
        avatar
    };
}

// ======================================================
// 💰 PRIX
// ======================================================

function getPrice(name) {
    switch (name) {

        case "5K acc":
            return "5€";

        case "2K acc":
            return "3€";

        case "1K acc":
            return "2€";

        case "500 acc":
            return "1€";

        case "My account":
            return "Sur demande";

        default:
            return "N/A";
    }
}

// ======================================================
// 🎮 EMBED SELLING
// ======================================================

function createSellingEmbed(accounts) {

    const embed = new EmbedBuilder()
        .setTitle("🎮 Comptes Roblox disponibles")
        .setDescription(
            "Voici les comptes actuellement disponibles.\n" +
            "Les statistiques sont mises à jour automatiquement."
        )
        .setColor(0x5865F2)
        .setTimestamp();

    for (const account of accounts) {

        let statsText =
            "⚠️ Statistiques indisponibles";

        if (account.stats) {
            statsText =
                `👥 Amis : **${account.stats.friends}**\n` +
                `👤 Followers : **${account.stats.followers}**\n` +
                `➡️ Following : **${account.stats.following}**`;
        }

        embed.addFields({
            name: `🎮 ${account.name}`,

            value:
                `**Username :** \`${account.username}\`\n` +
                `💰 **Prix :** ${getPrice(account.name)}\n\n` +
                statsText,

            inline: false
        });

        if (account.avatar) {
            embed.setThumbnail(account.avatar);
        }
    }

    embed.setFooter({
        text: "Selling ACC • Mise à jour automatique"
    });

    return embed;
}

// ======================================================
// 🔄 UPDATE SELLING
// ======================================================

async function updateSellingMessage() {

    if (updateInProgress) {
        console.log(
            "⏳ Une mise à jour Roblox est déjà en cours."
        );
        return;
    }

    updateInProgress = true;

    try {

        const channel = await client.channels.fetch(
            config.sellingChannelId
        );

        if (!channel) {
            console.log(
                "❌ Salon selling introuvable."
            );
            return;
        }

        const accounts = [];

        // On traite les comptes un par un.
        for (const account of config.robloxAccounts) {

            const data = await getAccountData(account);

            accounts.push(data);

            // Petite pause entre les comptes
            // pour éviter d'envoyer trop de requêtes
            // d'un coup.
            await new Promise(resolve =>
                setTimeout(resolve, 1500)
            );
        }

        const messages = await channel.messages.fetch({
            limit: 50
        });

        const botMessage = messages.find(
            message =>
                message.author.id === client.user.id &&
                message.embeds.length > 0 &&
                message.embeds[0].title ===
                    "🎮 Comptes Roblox disponibles"
        );

        const embed = createSellingEmbed(accounts);

        if (botMessage) {

            await botMessage.edit({
                embeds: [embed]
            });

            console.log(
                "🔄 Message Roblox mis à jour."
            );

        } else {

            await channel.send({
                embeds: [embed]
            });

            console.log(
                "✅ Message Roblox créé."
            );
        }

    } catch (error) {

        console.error(
            "❌ Erreur update Roblox :",
            error
        );

    } finally {

        updateInProgress = false;
    }
}

// ======================================================
// 🟢 BOT READY
// ======================================================

client.once("clientReady", async () => {

    console.log(
        `✅ Connecté en tant que ${client.user.tag}`
    );

    await sendTicketPanel();

    await sendRulesPanel();

    await updateSellingMessage();

    // Mise à jour toutes les 10 minutes
    setInterval(async () => {

        await updateSellingMessage();

    }, ROBLOX_UPDATE_INTERVAL);
});

// ======================================================
// 🖱️ INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    // ==================================================
    // 🎫 CRÉATION TICKET
    // ==================================================

    if (interaction.customId === "create_ticket") {

        try {

            const guild = interaction.guild;

            if (!guild) {
                return;
            }

            const existingChannel =
                guild.channels.cache.find(
                    channel =>
                        channel.name ===
                        `ticket-${interaction.user.username.toLowerCase()}`
                );

            if (existingChannel) {

                await interaction.reply({
                    content:
                        `❌ Tu as déjà un ticket ouvert : ${existingChannel}`,

                    flags: MessageFlags.Ephemeral
                });

                return;
            }

            const ticketChannel =
                await guild.channels.create({

                    name:
                        `ticket-${interaction.user.username}`,

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
                    `Bonjour ${interaction.user} 👋\n\n` +
                    "Explique ton problème et un membre du staff viendra t'aider.\n\n" +
                    "Merci de ne pas spammer."
                )
                .setColor(0x5865F2);

            await ticketChannel.send({

                content:
                    `${interaction.user}`,

                embeds: [embed]
            });

            await interaction.reply({

                content:
                    `✅ Ton ticket a été créé : ${ticketChannel}`,

                flags: MessageFlags.Ephemeral
            });

        } catch (error) {

            console.error(
                "❌ Erreur création ticket :",
                error
            );

            if (!interaction.replied) {

                await interaction.reply({

                    content:
                        "❌ Impossible de créer le ticket.",

                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    // ==================================================
    // 📜 ACCEPTATION RÈGLEMENT
    // ==================================================

    if (interaction.customId === "accept_rules") {

        try {

            const member =
                await interaction.guild.members.fetch(
                    interaction.user.id
                );

            const role =
                interaction.guild.roles.cache.get(
                    config.verifiedRoleId
                );

            if (!role) {

                await interaction.reply({

                    content:
                        "❌ Le rôle `VerifiedMember` est introuvable.",

                    flags: MessageFlags.Ephemeral
                });

                return;
            }

            if (member.roles.cache.has(role.id)) {

                await interaction.reply({

                    content:
                        "✅ Tu es déjà vérifié !",

                    flags: MessageFlags.Ephemeral
                });

                return;
            }

            await member.roles.add(role);

            await interaction.reply({

                content:
                    "✅ **Règlement accepté !**\n" +
                    "Tu as reçu le rôle **VerifiedMember**. Bienvenue ! 🎉",

                flags: MessageFlags.Ephemeral
            });

            console.log(
                `✅ ${interaction.user.tag} a accepté le règlement.`
            );

        } catch (error) {

            console.error(
                "❌ Erreur attribution VerifiedMember :",
                error
            );

            if (!interaction.replied) {

                await interaction.reply({

                    content:
                        "❌ Impossible de te donner le rôle. Vérifie que le bot possède la permission **Gérer les rôles** et que son rôle est placé au-dessus de `VerifiedMember`.",

                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
});

// ======================================================
// 🔑 CONNEXION
// ======================================================

if (!config.token) {

    console.error(
        "❌ DISCORD_TOKEN est manquant dans les variables d'environnement."
    );

    process.exit(1);
}

client.login(config.token);
