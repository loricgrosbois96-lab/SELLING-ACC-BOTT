const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChannelType,
    MessageFlags
} = require("discord.js");

const config = require("./config");

// ======================================================
// 🤖 CLIENT DISCORD
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// ======================================================
// 💾 CACHE ROBLOX
// ======================================================

const cachedUsers = new Map();
const cachedStats = new Map();
const cachedAvatars = new Map();

const robloxCooldown = new Map();

let updateInProgress = false;

// Actualisation toutes les 5 minutes
const ROBLOX_UPDATE_INTERVAL = 5 * 60 * 1000;

// Cache maximum de 5 minutes
const ROBLOX_CACHE_TIME = 5 * 60 * 1000;

// ======================================================
// 💤 SLEEP
// ======================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================
// 🎫 PANEL TICKETS
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

        // Évite de recréer le panel à chaque redémarrage
        const messages = await channel.messages.fetch({
            limit: 50
        });

        const alreadyExists = messages.some(message =>
            message.author.id === client.user.id &&
            message.embeds?.[0]?.title === "🎫 Support"
        );

        if (alreadyExists) {
            console.log("ℹ️ Panel tickets déjà présent.");
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
            .setLabel("Créer un ticket")
            .setEmoji("🎫")
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
// 📜 PANEL RÈGLEMENT
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

        // Évite les doublons au redémarrage
        const messages = await channel.messages.fetch({
            limit: 50
        });

        const alreadyExists = messages.some(message =>
            message.author.id === client.user.id &&
            message.embeds?.[0]?.title === "📜 Règlement du serveur"
        );

        if (alreadyExists) {
            console.log("ℹ️ Panel règlement déjà présent.");
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
// 🎮 ROBLOX - UTILISATEUR
// ======================================================

async function getRobloxUser(username) {

    const cacheKey = username.toLowerCase();

    const cached = cachedUsers.get(cacheKey);

    if (
        cached &&
        Date.now() - cached.time < ROBLOX_CACHE_TIME
    ) {
        return cached.user;
    }

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
                `⚠️ Roblox RATE LIMIT utilisateur : ${username}`
            );

            return cached?.user || null;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {

            console.log(
                `⚠️ Compte Roblox introuvable : ${username}`
            );

            return null;
        }

        const user = data.data[0];

        cachedUsers.set(cacheKey, {
            user,
            time: Date.now()
        });

        return user;

    } catch (error) {

        console.error(
            `❌ Erreur utilisateur Roblox ${username} :`,
            error.message
        );

        return cached?.user || null;
    }
}

// ======================================================
// 📊 ROBLOX - STATISTIQUES
// ======================================================

async function getRobloxStats(userId) {

    const cached = cachedStats.get(userId);

    // Cache valide
    if (
        cached &&
        Date.now() - cached.time < ROBLOX_CACHE_TIME
    ) {
        return cached.stats;
    }

    // Cooldown après rate limit
    const cooldown = robloxCooldown.get(userId);

    if (
        cooldown &&
        Date.now() < cooldown
    ) {
        console.log(
            `⏳ Roblox ${userId} en cooldown. Anciennes stats utilisées.`
        );

        return cached?.stats || null;
    }

    const endpoints = {
        friends:
            `https://friends.roblox.com/v1/users/${userId}/friends/count`,

        followers:
            `https://friends.roblox.com/v1/users/${userId}/followers/count`,

        following:
            `https://friends.roblox.com/v1/users/${userId}/followings/count`
    };

    try {

        const stats = {};

        for (const [name, url] of Object.entries(endpoints)) {

            const response = await fetch(url);

            // Rate limit
            if (response.status === 429) {

                const retryAfterHeader =
                    response.headers.get("retry-after");

                const retryAfter =
                    Number(retryAfterHeader);

                const wait =
                    Number.isFinite(retryAfter)
                        ? Math.max(retryAfter * 1000, 30000)
                        : 10 * 60 * 1000;

                robloxCooldown.set(
                    userId,
                    Date.now() + wait
                );

                console.log(
                    `⚠️ RATE LIMIT Roblox ${userId}.`
                );

                return cached?.stats || null;
            }

            if (!response.ok) {
                throw new Error(
                    `${name}: HTTP ${response.status}`
                );
            }

            const data = await response.json();

            stats[name] = Number(data.count ?? 0);

            // Petite pause pour éviter d'enchaîner trop vite
            await sleep(500);
        }

        cachedStats.set(userId, {
            stats,
            time: Date.now()
        });

        robloxCooldown.delete(userId);

        console.log(
            `📊 Roblox ${userId} → ` +
            `Amis: ${stats.friends} | ` +
            `Followers: ${stats.followers} | ` +
            `Following: ${stats.following}`
        );

        return stats;

    } catch (error) {

        console.error(
            `❌ Erreur stats Roblox ${userId} :`,
            error.message
        );

        return cached?.stats || null;
    }
}

// ======================================================
// 🖼️ ROBLOX - AVATAR
// ======================================================

async function getRobloxAvatar(userId) {

    const cached = cachedAvatars.get(userId);

    if (
        cached &&
        Date.now() - cached.time < ROBLOX_CACHE_TIME
    ) {
        return cached.avatar;
    }

    try {

        const url =
            `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
            `?userIds=${userId}` +
            `&size=150x150` +
            `&format=Png` +
            `&isCircular=false`;

        const response = await fetch(url);

        if (response.status === 429) {
            return cached?.avatar || null;
        }

        if (!response.ok) {
            return cached?.avatar || null;
        }

        const data = await response.json();

        const avatar =
            data.data?.[0]?.imageUrl || null;

        if (avatar) {

            cachedAvatars.set(userId, {
                avatar,
                time: Date.now()
            });
        }

        return avatar;

    } catch (error) {

        console.error(
            "❌ Erreur avatar Roblox :",
            error.message
        );

        return cached?.avatar || null;
    }
}

// ======================================================
// 📦 INFORMATIONS COMPLÈTES DU COMPTE
// ======================================================

async function getAccountData(account) {

    const user =
        await getRobloxUser(account.username);

    if (!user) {

        return {
            ...account,

            userId: null,

            displayName: account.username,

            username: account.username,

            stats: null,

            avatar: null
        };
    }

    const stats =
        await getRobloxStats(user.id);

    const avatar =
        await getRobloxAvatar(user.id);

    return {

        ...account,

        userId: user.id,

        displayName:
            user.displayName || user.name,

        username:
            user.name || account.username,

        stats,

        avatar
    };
}

// ======================================================
// 🎮 EMBED ROBLOX
// ======================================================

function createAccountEmbed(account) {

    const displayName =
        account.displayName ||
        account.username;

    const stats =
        account.stats || {};

    const friends =
        stats.friends ?? "N/A";

    const followers =
        stats.followers ?? "N/A";

    const following =
        stats.following ?? "N/A";

    const embed =
        new EmbedBuilder()

            .setTitle(
                `🎮 ${account.name}`
            )

            .setDescription(
                `👤 **${displayName}**\n` +
                `🏷️ @${account.username}\n\n` +

                `🆔 **ID Roblox**\n` +
                `\`${account.userId || "Inconnu"}\`\n\n` +

                `👥 **Amis**\n` +
                `**${friends}**\n\n` +

                `👤 **Followers**\n` +
                `**${followers}**\n\n` +

                `➡️ **Following**\n` +
                `**${following}**\n\n` +

                `🔄 **Mise à jour automatique toutes les 5 minutes**`
            )

            .setColor(0x5865F2)

            .setFooter({
                text:
                    "LoricBot • Informations Roblox"
            })

            .setTimestamp();

    if (account.avatar) {
        embed.setThumbnail(account.avatar);
    }

    return embed;
}

// ======================================================
// 🔎 RECONNAÎTRE LES EMBEDS ROBLOX
// ======================================================

function isRobloxMessage(message) {

    if (!message.author) {
        return false;
    }

    if (
        message.author.id !==
        client.user.id
    ) {
        return false;
    }

    if (!message.embeds?.length) {
        return false;
    }

    const embed =
        message.embeds[0];

    return (
        embed.title?.startsWith("🎮 ") &&
        embed.footer?.text?.includes(
            "LoricBot • Informations Roblox"
        )
    );
}

// ======================================================
// 🔄 MISE À JOUR ROBLOX
// ======================================================

async function updateSellingMessage() {

    if (updateInProgress) {
        console.log("⏳ Mise à jour Roblox déjà en cours.");
        return;
    }

    updateInProgress = true;

    try {

        console.log("========================================");
        console.log("🔄 ACTUALISATION DES COMPTES ROBLOX");
        console.log("========================================");

        const channel =
            await client.channels.fetch(
                config.sellingChannelId
            );

        if (!channel) {
            console.log(
                "❌ Salon selling introuvable."
            );
            return;
        }

        const accounts = [];

        // ==================================================
        // RÉCUPÉRATION DES COMPTES
        // ==================================================

        for (const account of config.robloxAccounts) {

            console.log(
                `🔍 Récupération : ${account.username}`
            );

            const data =
                await getAccountData(account);

            accounts.push(data);

            // Pause entre chaque compte
            await sleep(1500);
        }

        // ==================================================
        // EMBEDS
        // ==================================================

        const embeds =
            accounts.map(account =>
                createAccountEmbed(account)
            );

        // ==================================================
        // MESSAGES EXISTANTS
        // ==================================================

        const messages =
            await channel.messages.fetch({
                limit: 100
            });

        const oldMessages =
            messages
                .filter(isRobloxMessage)
                .sort(
                    (a, b) =>
                        a.createdTimestamp -
                        b.createdTimestamp
                );

        // ==================================================
        // MODIFIER / CRÉER
        // ==================================================

        for (
            let i = 0;
            i < embeds.length;
            i++
        ) {

            if (oldMessages[i]) {

                await oldMessages[i].edit({
                    embeds: [
                        embeds[i]
                    ]
                });

                console.log(
                    `✏️ Embed mis à jour : ${accounts[i].username}`
                );

            } else {

                await channel.send({
                    embeds: [
                        embeds[i]
                    ]
                });

                console.log(
                    `➕ Embed créé : ${accounts[i].username}`
                );
            }

            await sleep(500);
        }

        // ==================================================
        // SUPPRESSION DES EMBEDS EN TROP
        // ==================================================

        if (
            oldMessages.length >
            embeds.length
        ) {

            for (
                let i = embeds.length;
                i < oldMessages.length;
                i++
            ) {

                try {
                    await oldMessages[i].delete();
                } catch {}
            }
        }

        console.log("========================================");
        console.log("✅ COMPTES ROBLOX MIS À JOUR");
        console.log("========================================");

    } catch (error) {

        console.error(
            "❌ Erreur interface Roblox :",
            error
        );

    } finally {

        updateInProgress = false;
    }
}

// ======================================================
// 🟢 BOT READY
// ======================================================

client.once(
    "clientReady",
    async () => {

        console.log(
            `✅ Connecté en tant que ${client.user.tag}`
        );

        // Panel tickets
        await sendTicketPanel();

        // Panel règlement
        await sendRulesPanel();

        // Première mise à jour immédiatement
        await updateSellingMessage();

        // Puis toutes les 5 minutes
        setInterval(
            async () => {
                await updateSellingMessage();
            },
            ROBLOX_UPDATE_INTERVAL
        );

        console.log(
            "⏰ Actualisation Roblox programmée toutes les 5 minutes."
        );
    }
);

// ======================================================
// 🖱️ INTERACTIONS
// ======================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        // ==================================================
        // 🎫 CRÉER TICKET
        // ==================================================

        if (
            interaction.customId ===
            "create_ticket"
        ) {

            try {

                const guild =
                    interaction.guild;

                if (!guild) {
                    return;
                }

                const ticketName =
                    `ticket-${interaction.user.username}`
                        .toLowerCase()
                        .replace(/[^a-z0-9-_]/g, "-");

                const existing =
                    guild.channels.cache.find(
                        channel =>
                            channel.name === ticketName
                    );

                if (existing) {

                    await interaction.reply({
                        content:
                            `❌ Tu as déjà un ticket ouvert : ${existing}`,
                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }

                const permissionOverwrites = [

                    {
                        id:
                            guild.roles.everyone.id,

                        deny: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    },

                    {
                        id:
                            interaction.user.id,

                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ];

                // Ajoute le rôle staff si configuré
                if (config.staffRoleId) {

                    permissionOverwrites.push({
                        id: config.staffRoleId,

                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    });
                }

                const ticketChannel =
                    await guild.channels.create({

                        name: ticketName,

                        type: ChannelType.GuildText,

                        permissionOverwrites
                    });

                const embed =
                    new EmbedBuilder()

                        .setTitle("🎫 Ticket")

                        .setDescription(
                            `Bonjour ${interaction.user} 👋\n\n` +
                            "Explique ton problème et un membre du staff viendra t'aider.\n\n" +
                            "Merci de ne pas spammer."
                        )

                        .setColor(0x5865F2)

                        .setTimestamp();

                await ticketChannel.send({
                    content:
                        `${interaction.user}`,
                    embeds: [
                        embed
                    ]
                });

                await interaction.reply({
                    content:
                        `✅ Ton ticket a été créé : ${ticketChannel}`,
                    flags:
                        MessageFlags.Ephemeral
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
                        flags:
                            MessageFlags.Ephemeral
                    });
                }
            }
        }

        // ==================================================
        // 📜 ACCEPTER RÈGLEMENT
        // ==================================================

        if (
            interaction.customId ===
            "accept_rules"
        ) {

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
                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }

                if (
                    member.roles.cache.has(
                        role.id
                    )
                ) {

                    await interaction.reply({
                        content:
                            "✅ Tu es déjà vérifié !",
                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }

                await member.roles.add(role);

                await interaction.reply({
                    content:
                        "✅ **Règlement accepté !**\n" +
                        "Tu as reçu le rôle **VerifiedMember**. Bienvenue ! 🎉",
                    flags:
                        MessageFlags.Ephemeral
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
                            "❌ Impossible de te donner le rôle. Vérifie que le bot possède la permission **Gérer les rôles** et que son rôle est au-dessus de `VerifiedMember`.",
                        flags:
                            MessageFlags.Ephemeral
                    });
                }
            }
        }
    }
);

// ======================================================
// 🔑 CONNEXION
// ======================================================

if (!config.token) {

    console.error(
        "❌ Le token Discord est manquant."
    );

    process.exit(1);
}

client.login(config.token);
