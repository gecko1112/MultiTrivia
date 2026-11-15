// More/Less: the cards and their numbers. SERVER ONLY: this folder is never sent to the browser, which learns a
// card's number only after the player made the call on it (moreless-server.js).
// Movie ratings: IMDb charts read 7 Nov 2026.
// Box office: Wikipedia "List of highest-grossing films" (worldwide, unadjusted; read Nov 2026).
// Spotify: Wikipedia "List of Spotify streaming records" (songs, as of 6 Sep 2026) and
//          "List of most-streamed artists on Spotify" (monthly listeners, as of 19 Sep 2026).
module.exports = [
 {key:"spotify", name:"Spotify", gap:1.05, sets:[
   {label:"all-time Spotify streams", unit:"streams", src:"Spotify song streams as of 6 Sep 2026 (Wikipedia list)", items:[
    ["Blinding Lights","The Weeknd",5.578e9],["Shape of You","Ed Sheeran",5.083e9],["Sweater Weather","The Neighbourhood",4.857e9],
    ["Starboy","The Weeknd & Daft Punk",4.740e9],["As It Was","Harry Styles",4.610e9],["One Dance","Drake, Wizkid & Kyla",4.451e9],
    ["Someone You Loved","Lewis Capaldi",4.428e9],["Perfect","Ed Sheeran",4.100e9],["I Wanna Be Yours","Arctic Monkeys",3.982e9],
    ["Yellow","Coldplay",3.960e9],["Heat Waves","Glass Animals",3.918e9],["Riptide","Vance Joy",3.893e9],
    ["Every Breath You Take","The Police",3.734e9],["Another Love","Tom Odell",3.685e9],["Counting Stars","OneRepublic",3.633e9],
    ["Take Me to Church","Hozier",3.579e9],["Dance Monkey","Tones and I",3.506e9],["Cruel Summer","Taylor Swift",3.477e9],
    ["Mr. Brightside","The Killers",3.452e9],["In the End","Linkin Park",3.351e9],["Bohemian Rhapsody","Queen",3.263e9],
    ["Wake Me Up","Avicii",3.223e9],["Billie Jean","Michael Jackson",3.215e9],["Espresso","Sabrina Carpenter",3.169e9],
    ["Creep","Radiohead",3.111e9],["Smells Like Teen Spirit","Nirvana",3.072e9],["Wonderwall","Oasis",3.047e9],
    ["Lose Yourself","Eminem",3.010e9],["Flowers","Miley Cyrus",2.975e9],["Don't Stop Believin'","Journey",2.974e9],
    ["Dreams","Fleetwood Mac",2.924e9],["Take On Me","a-ha",2.909e9],["Sweet Child O' Mine","Guns N' Roses",2.869e9],
    ["Uptown Funk","Mark Ronson & Bruno Mars",2.777e9],["Don't Stop Me Now","Queen",2.758e9],["Africa","Toto",2.747e9]]},
   {label:"Spotify monthly listeners", unit:"monthly listeners", src:"Monthly listeners as of 19 Sep 2026 (Wikipedia list)", items:[
    ["Bruno Mars","",132.2e6],["Rihanna","",116.4e6],["The Weeknd","",114.6e6],["Taylor Swift","",100.5e6],["Bad Bunny","",95.7e6],
    ["Coldplay","",94.5e6],["Katy Perry","",91.1e6],["David Guetta","",84.8e6],["Ed Sheeran","",81.1e6],["Billie Eilish","",77.6e6],
    ["Eminem","",73.8e6],["Kendrick Lamar","",70.5e6],["Olivia Rodrigo","",67.5e6],["SZA","",66e6],["Lana Del Rey","",65.3e6],
    ["Harry Styles","",64.3e6],["Tame Impala","",63.1e6],["Travis Scott","",60.4e6],["Adele","",59e6],["Linkin Park","",57.2e6],
    ["Arctic Monkeys","",55.7e6],["Doja Cat","",55.2e6]]}
 ]},
 {key:"film", name:"Movie ratings", diff:0.3, sets:[
   {label:"IMDb rating", unit:"/ 10", rating:true, src:"IMDb user ratings, read 7 Nov 2026 (Top 250, Lowest Rated and Most Popular charts). Ratings drift slightly over time.", items:[
    ["The Shawshank Redemption","1994",9.3],["The Godfather","1972",9.2],["The Dark Knight","2008",9.1],["Pulp Fiction","1994",8.8],
    ["Forrest Gump","1994",8.8],["Inception","2010",8.8],["Fight Club","1999",8.8],["The Matrix","1999",8.7],["Interstellar","2014",8.7],
    ["Spirited Away","2001",8.6],["Back to the Future","1985",8.5],["Gladiator","2000",8.5],["The Lion King","1994",8.5],["Parasite","2019",8.5],
    ["Alien","1979",8.4],["WALL·E","2008",8.4],["Toy Story","1995",8.3],["Up","2009",8.3],["Die Hard","1988",8.2],["Jurassic Park","1993",8.2],
    ["Oppenheimer","2023",8.2],["Finding Nemo","2003",8.2],["Monty Python and the Holy Grail","1975",8.1],["Jaws","1975",8.1],
    ["Ratatouille","2007",8.1],["Mad Max: Fury Road","2015",8.1],["The Big Lebowski","1998",8.1],["The Wizard of Oz","1939",8.1],
    ["The Incredibles","2004",8.0],["The Nightmare Before Christmas","1993",7.9],["Coraline","2009",7.8],["Ghostbusters","1984",7.8],
    ["Halloween","1978",7.7],["Scream","1996",7.5],["The Conjuring","2013",7.5],["Sinners","2025",7.5],["Beetlejuice","1988",7.4],
    ["The Rocky Horror Picture Show","1975",7.4],["Weapons","2025",7.4],["Hereditary","2018",7.3],["It","2017",7.3],["Sleepy Hollow","1999",7.3],
    ["The Addams Family","1991",7.0],["Hocus Pocus","1993",6.9],["Beetlejuice Beetlejuice","2024",6.6],["Practical Magic","1998",6.4],
    ["Scary Movie","2000",6.3],["Friday the 13th","1980",6.3],["Casper","1995",6.2],["Hocus Pocus 2","2022",6.0],["Hubie Halloween","2020",5.3],
    ["Batman & Robin","1997",3.8],["Superman IV: The Quest for Peace","1987",3.8],["The Room","2003",3.6],["Scary Movie 5","2013",3.6],
    ["The Emoji Movie","2017",3.5],["Catwoman","2004",3.5],["Jack and Jill","2011",3.3],["Kazaam","1996",3.2],["Troll 2","1990",3.1],
    ["Jaws: The Revenge","1987",3.1],["Meet the Spartans","2008",2.9],["Winnie-the-Pooh: Blood and Honey","2023",2.9],["Cats","2019",2.8],
    ["Gigli","2003",2.7],["Battlefield Earth","2000",2.5],["Dragonball: Evolution","2009",2.5],["Epic Movie","2007",2.5],["Glitter","2001",2.5],
    ["Son of the Mask","2005",2.3],["Disaster Movie","2008",1.9]]}
 ]},
 {key:"price", name:"Price tags", gap:1.08, sets:[
   {label:"price paid", unit:"USD", money:true, src:"Sale or deal prices in US dollars at the time (not inflation-adjusted). Deals use announced values.", items:[
    ["Microsoft buys Mojang (Minecraft)","2014",2.5e9,"⛏️"],["Facebook buys Instagram","2012",1e9,"📸"],["Facebook buys WhatsApp","2014",19e9,"💬"],
    ["Elon Musk buys Twitter","2022",44e9,"🐦"],["Google buys YouTube","2006",1.65e9,"📺"],["Disney buys Lucasfilm","2012",4.05e9,"🎬"],
    ["Amazon buys Whole Foods","2017",13.7e9,"🛒"],["Microsoft buys Activision Blizzard (announced)","2022",68.7e9,"🎮"],
    ["Leonardo's 'Salvator Mundi'","2017",450.3e6,"🖼️"],["Warhol's 'Shot Sage Blue Marilyn'","2022",195e6,"🖼️"],
    ["Beeple's NFT 'Everydays'","2021",69.3e6,"🖥️"],["Stegosaurus skeleton 'Apex'","2024",44.6e6,"🦕"],["T. rex skeleton 'Sue'","1997",8.36e6,"🦖"],
    ["Babe Ruth's 'called shot' jersey","2024",24.12e6,"⚾"],["Michael Jordan's 1998 Finals jersey","2022",10.1e6,"🏀"],
    ["Maradona's 'Hand of God' shirt","2022",9.3e6,"⚽"],["1952 Topps Mickey Mantle card","2022",12.6e6,"⚾"],
    ["T206 Honus Wagner card","2022",7.25e6,"🃏"],["Mercedes 300 SLR Uhlenhaut Coupé","2022",143e6,"🏎️"],["Ferrari 250 GTO (auction)","2018",48.4e6,"🏎️"],
    ["The 'Pink Star' diamond","2017",71.2e6,"💎"],["First printing of the US Constitution","2021",43.2e6,"📜"],
    ["Leonardo's Codex Leicester","1994",30.8e6,"📓"],["1297 Magna Carta copy","2007",21.3e6,"📜"],["1933 Double Eagle gold coin","2021",18.9e6,"🪙"],
    ["British Guiana 1c magenta stamp","2021",8.3e6,"✉️"],["Wu-Tang Clan's one-copy album","2015",2e6,"💿"],
    ["Marilyn Monroe's 'Happy Birthday' dress","2016",4.8e6,"👗"],["'Lady Blunt' Stradivarius violin","2011",15.9e6,"🎻"],
    ["Dorothy's ruby slippers","2024",32.5e6,"👠"],["Kurt Cobain's 'Unplugged' guitar","2020",6.01e6,"🎸"],["Action Comics #1 (CGC 8.5)","2024",6e6,"📕"]]}
 ]},
 {key:"pop", name:"Big numbers", gap:1.12, sets:[
   {name:"Box office", label:"worldwide box office", unit:"USD", money:true, src:"Worldwide gross, unadjusted (Wikipedia list, Nov 2026)", items:[
    ["Avengers: Endgame","2019",2942186933],["Avatar","2009",2923710708],["Avatar: The Way of Water","2022",2334484620],
    ["Titanic","1997",2257906828],["Ne Zha 2","2025",2217758382],["Star Wars: The Force Awakens","2015",2068223624],
    ["Spider-Man: No Way Home","2021",1922598800],["Zootopia 2","2025",1870309291],["Inside Out 2","2024",1698863816],
    ["Jurassic World","2015",1671537444],["The Lion King","2019",1656943394],["The Avengers","2012",1518815515],
    ["Top Gun: Maverick","2022",1503260455],["Frozen 2","2019",1450026933],["Barbie","2023",1447138421],
    ["The Super Mario Bros. Movie","2023",1360783214],["Black Panther","2018",1347280838],
    ["Harry Potter and the Deathly Hallows – Part 2","2011",1342139727],["Frozen","2013",1290000000],
    ["Incredibles 2","2018",1242805359],["Minions","2015",1159444662],["The Return of the King","2003",1147997407],
    ["Skyfall","2012",1108594137],["The Dark Knight Rises","2012",1081169825],["Joker","2019",1074458282],
    ["Toy Story 3","2010",1066970811],["E.T. the Extra-Terrestrial","1982",797307407],["Jaws","1975",495201848]]},
   {name:"Population", flag:true, label:"population", unit:"people", src:"Approximate mid-2020s estimates (UN / national statistics), rounded", items:[
    ["India","🇮🇳",1.45e9],["United States","🇺🇸",345e6],["Indonesia","🇮🇩",283e6],["Nigeria","🇳🇬",230e6],["Brazil","🇧🇷",212e6],
    ["Russia","🇷🇺",144e6],["Japan","🇯🇵",124e6],["Egypt","🇪🇬",116e6],["Vietnam","🇻🇳",101e6],["Germany","🇩🇪",83.5e6],["United Kingdom","🇬🇧",69e6],
    ["France","🇫🇷",66e6],["Italy","🇮🇹",59e6],["South Korea","🇰🇷",51.7e6],["Spain","🇪🇸",48.5e6],["Canada","🇨🇦",40e6],["Poland","🇵🇱",37.5e6],
    ["Australia","🇦🇺",27e6],["Netherlands","🇳🇱",18e6],["Sweden","🇸🇪",10.6e6],["Switzerland","🇨🇭",8.9e6],["Denmark","🇩🇰",5.9e6],
    ["Ireland","🇮🇪",5.3e6],["Iceland","🇮🇸",390e3],["Luxembourg","🇱🇺",670e3],["Malta","🇲🇹",540e3],["Liechtenstein","🇱🇮",40e3],
    ["Monaco","🇲🇨",38e3],["Tokyo metro area","🏙️",37e6],["Berlin","🏙️",3.8e6],["New York City","🗽",8.3e6],["Paris (city proper)","🗼",2.1e6]]}
 ]},
 {key:"trivia", name:"Trivia", gap:1.15, trivia:true}
];
