// Oddball: how well known each country is, so a rare right answer can score more than an obvious one. SERVER ONLY.
//
// AN ESTIMATE, written by hand (by Claude) from how likely a typical player is to name the country: 5 = everybody
// knows it, 1 = few could place it. Countries not listed are 2. Inside a tier, larger countries count as better
// known (oddball-server.js). Every answer players give is counted on the server (db.oddStats), so once enough
// players have answered, real answers can replace this estimate.
module.exports = {
  5: 'us cn ru gb fr de it es jp in br ca au mx eg za ar kr tr gr nl se ch pt pl ie ng ke sa ua',
  4: 'be at no dk fi is cz hu ro hr il ir iq af pk th vn id ph my sg nz cl pe co ve cu jm ma dz tn et gh kp np sy ae qa uy ec bo do cr pa ht mn lk ly cd va mc',
  3: 'bd lb jo kw om ye ge am az kz uz tm kg tj bg rs ba me mk al si sk lu ee lv lt by md mt cy li sm ad tw kh la mm bt mv fj pg bs bb tt hn ni gt sv bz gy sr py mg tz ug zw so sd ao mz rw na bw zm sn ci cm ml xk ps bh bn',
  1: 'ki tv nr pw mh fm sb vu to ws kn lc vc ag dm gd st km gq gw sz cv bi cf tl'
};
