/**
 * SQLite ORDER BY 片段：按 IPv4 四段数值升序（避免字符串排序下 10 < 2 的问题）。
 * @param {string} alias 表别名，如 ipa、c
 */
function orderByIpv4NumericAsc(alias) {
  const a = alias;
  const rest2 = `substr(${a}.ip_address, instr(${a}.ip_address, '.') + 1)`;
  const rest3 = `substr(${rest2}, instr(${rest2}, '.') + 1)`;
  return `(
    CAST(substr(${a}.ip_address, 1, instr(${a}.ip_address, '.') - 1) AS INTEGER) * 16777216 +
    CAST(substr(${rest2}, 1, instr(${rest2}, '.') - 1) AS INTEGER) * 65536 +
    CAST(substr(${rest3}, 1, instr(${rest3}, '.') - 1) AS INTEGER) * 256 +
    CAST(substr(${rest3}, instr(${rest3}, '.') + 1) AS INTEGER)
  ) ASC`;
}

module.exports = { orderByIpv4NumericAsc };
