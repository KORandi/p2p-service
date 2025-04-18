/**
 * CA Tool - Certificate Authority and Certificate Generation Tool
 *
 * A utility script to:
 * 1. Create your own Certificate Authority (CA)
 * 2. Issue server certificates signed by your CA
 * 3. Manage your certificate infrastructure
 *
 * Usage:
 *   - Create a CA: node ca-tool.js create-ca <output-dir> <org-name>
 *   - Create server cert: node ca-tool.js create-cert <ca-dir> <server-name> [days]
 *   - List certificates: node ca-tool.js list <ca-dir>
 *   - Check cert: node ca-tool.js check <cert-file>
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

// Create CA command
function createCA(outputDir, orgName = "P2P Network CA") {
  // Validate input
  if (!outputDir) {
    console.error("Error: Output directory is required");
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Paths for generated files
  const caKeyPath = path.join(outputDir, "ca.key");
  const caCertPath = path.join(outputDir, "ca.crt");
  const caSerialPath = path.join(outputDir, "ca.srl");
  const caIndexPath = path.join(outputDir, "ca.index");
  const configPath = path.join(outputDir, "openssl.cnf");

  // Check if CA already exists
  if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
    console.error("Error: CA already exists in this directory");
    process.exit(1);
  }

  // Create CA configuration file for OpenSSL
  const openSslConfig = `
[ ca ]
default_ca = CA_default

[ CA_default ]
dir               = ${outputDir.replace(/\\/g, "/")}
certs             = $dir
crl_dir           = $dir
new_certs_dir     = $dir
database          = $dir/ca.index
serial            = $dir/ca.srl
RANDFILE          = $dir/.rand
private_key       = $dir/ca.key
certificate       = $dir/ca.crt
crlnumber         = $dir/crlnumber
crl               = $dir/crl.pem
crl_extensions    = crl_ext
default_crl_days  = 30
default_md        = sha256
name_opt          = ca_default
cert_opt          = ca_default
default_days      = 730
preserve          = no
policy            = policy_strict

[ policy_strict ]
countryName             = optional
stateOrProvinceName     = optional
organizationName        = supplied
organizationalUnitName  = optional
commonName              = supplied
emailAddress            = optional

[ req ]
default_bits        = 4096
distinguished_name  = req_distinguished_name
string_mask         = utf8only
default_md          = sha256
x509_extensions     = v3_ca

[ req_distinguished_name ]
countryName                     = Country Name (2 letter code)
stateOrProvinceName             = State or Province Name
localityName                    = Locality Name
0.organizationName              = Organization Name
organizationalUnitName          = Organizational Unit Name
commonName                      = Common Name
emailAddress                    = Email Address

[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign

[ v3_server ]
basicConstraints = CA:FALSE
nsCertType = server
nsComment = "OpenSSL Generated Server Certificate"
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer:always
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
  `;

  try {
    // Write OpenSSL configuration
    fs.writeFileSync(configPath, openSslConfig);
    console.log(`Created OpenSSL configuration at: ${configPath}`);

    // Create an empty index file (certificate database)
    fs.writeFileSync(caIndexPath, "");

    // Set initial serial number
    const serialNumber = crypto.randomBytes(16).toString("hex");
    fs.writeFileSync(caSerialPath, serialNumber);

    // Generate CA private key (4096 bits for CA)
    console.log("Generating CA private key...");
    execSync(`openssl genrsa -out "${caKeyPath}" 4096`);

    // Make CA key readable only by the owner
    try {
      fs.chmodSync(caKeyPath, 0o400);
    } catch (error) {
      console.warn(
        `Warning: Could not set restrictive permissions on CA key: ${error.message}`
      );
    }

    // Generate self-signed CA certificate
    console.log("Generating CA certificate...");
    execSync(
      `openssl req -config "${configPath}" -key "${caKeyPath}" -new -x509 -days 3650 -sha256 ` +
        `-extensions v3_ca -out "${caCertPath}" ` +
        `-subj "/CN=${orgName} Root CA/O=${orgName}"`
    );

    console.log("\nCA successfully created!");
    console.log("CA Certificate:", caCertPath);
    console.log("CA Private Key:", caKeyPath);
    console.log("\nIMPORTANT: Keep the CA private key (ca.key) secure!");
    console.log(
      "The security of your entire certificate infrastructure depends on this key."
    );

    // Show certificate info
    const certInfo = execSync(
      `openssl x509 -in "${caCertPath}" -noout -text | grep -E "Subject:|Issuer:|Not Before:|Not After"`
    ).toString();
    console.log("\nCA Certificate Information:");
    console.log(certInfo);
  } catch (error) {
    console.error("Error creating CA:", error.message);
    process.exit(1);
  }
}

// Create server certificate command
function createServerCert(caDir, serverName, days = 730) {
  // Validate input
  if (!caDir || !serverName) {
    console.error("Error: CA directory and server name are required");
    process.exit(1);
  }

  // Check if CA exists
  const caKeyPath = path.join(caDir, "ca.key");
  const caCertPath = path.join(caDir, "ca.crt");
  const configPath = path.join(caDir, "openssl.cnf");

  if (!fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)) {
    console.error("Error: CA not found in the specified directory");
    process.exit(1);
  }

  // Create output directory for server certificate
  const serverDir = path.join(caDir, "servers", serverName);
  if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
    console.log(`Created directory for server certificates: ${serverDir}`);
  }

  // Paths for server certificate files
  const keyPath = path.join(serverDir, `${serverName}.key`);
  const csrPath = path.join(serverDir, `${serverName}.csr`);
  const certPath = path.join(serverDir, `${serverName}.crt`);
  const serverConfigPath = path.join(serverDir, `${serverName}.cnf`);

  // Create server configuration with SAN
  const serverConfig = `
[ req ]
default_bits       = 2048
distinguished_name = req_distinguished_name
req_extensions     = req_ext
prompt             = no

[ req_distinguished_name ]
C = US
O = ${serverName}
CN = ${serverName}

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = ${serverName}
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
  `;

  try {
    // Write server configuration
    fs.writeFileSync(serverConfigPath, serverConfig);
    console.log(`Created server configuration at: ${serverConfigPath}`);

    // Generate server private key
    console.log(`Generating private key for ${serverName}...`);
    execSync(`openssl genrsa -out "${keyPath}" 2048`);

    // Generate certificate signing request (CSR)
    console.log(`Generating certificate signing request for ${serverName}...`);
    execSync(
      `openssl req -new -key "${keyPath}" -out "${csrPath}" -config "${serverConfigPath}"`
    );

    // Sign the CSR with the CA
    console.log(`Signing certificate for ${serverName} with CA...`);
    execSync(
      `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" ` +
        `-CAcreateserial -out "${certPath}" -days ${days} -sha256 ` +
        `-extensions req_ext -extfile "${serverConfigPath}"`
    );

    // Output success message
    console.log(`\nServer certificate for ${serverName} created successfully!`);
    console.log("Private Key:", keyPath);
    console.log("Certificate:", certPath);
    console.log("CA Certificate:", caCertPath);

    // Show certificate info
    console.log("\nCertificate Information:");
    const certInfo = execSync(
      `openssl x509 -in "${certPath}" -noout -text | grep -E "Subject:|Issuer:|Not Before:|Not After"`
    ).toString();
    console.log(certInfo);

    console.log("\nTo use this certificate in your P2P server:");
    console.log(`
const server = P2PServer.createServer({
  // ... other config options
  tls: {
    enabled: true,
    keyPath: "${keyPath.replace(/\\/g, "\\\\")}",
    certPath: "${certPath.replace(/\\/g, "\\\\")}",
    caPath: "${caCertPath.replace(/\\/g, "\\\\")}",
    requireClientCert: false
  }
});
    `);
  } catch (error) {
    console.error(
      `Error creating server certificate for ${serverName}:`,
      error.message
    );
    process.exit(1);
  }
}

// List certificates command
function listCertificates(caDir) {
  if (!caDir || !fs.existsSync(caDir)) {
    console.error("Error: Valid CA directory required");
    process.exit(1);
  }

  console.log("Certificate Authority:");
  const caCertPath = path.join(caDir, "ca.crt");

  if (fs.existsSync(caCertPath)) {
    const caInfo = execSync(
      `openssl x509 -in "${caCertPath}" -noout -subject -issuer -dates`
    ).toString();
    console.log(caInfo);
  } else {
    console.log("CA certificate not found!");
  }

  // List server certificates
  const serversDir = path.join(caDir, "servers");
  if (fs.existsSync(serversDir)) {
    const servers = fs.readdirSync(serversDir);

    if (servers.length > 0) {
      console.log("\nServer Certificates:");

      servers.forEach((server) => {
        const certPath = path.join(serversDir, server, `${server}.crt`);
        if (fs.existsSync(certPath)) {
          console.log(`\n${server}:`);
          try {
            const certInfo = execSync(
              `openssl x509 -in "${certPath}" -noout -subject -issuer -dates`
            ).toString();
            console.log(certInfo);
          } catch (error) {
            console.log(`  Error reading certificate: ${error.message}`);
          }
        }
      });
    } else {
      console.log("\nNo server certificates found.");
    }
  } else {
    console.log("\nNo server certificates found.");
  }
}

// Check certificate info
function checkCertificate(certPath) {
  if (!certPath || !fs.existsSync(certPath)) {
    console.error("Error: Valid certificate file path required");
    process.exit(1);
  }

  try {
    console.log(`Certificate Information for: ${certPath}`);
    console.log(
      execSync(`openssl x509 -in "${certPath}" -text -noout`).toString()
    );

    // Verify against CA if possible
    const dirName = path.dirname(certPath);
    const caPath = path.join(dirName, "..", "..", "ca.crt");

    if (fs.existsSync(caPath)) {
      console.log("\nVerifying certificate against CA:");
      console.log(
        execSync(`openssl verify -CAfile "${caPath}" "${certPath}"`).toString()
      );
    }
  } catch (error) {
    console.error("Error checking certificate:", error.message);
    process.exit(1);
  }
}

// Main function to handle commands
function main() {
  if (!command) {
    // Display help if no command provided
    showHelp();
    return;
  }

  switch (command.toLowerCase()) {
    case "create-ca":
      createCA(args[0], args[1]);
      break;
    case "create-cert":
      createServerCert(args[0], args[1], args[2]);
      break;
    case "list":
      listCertificates(args[0]);
      break;
    case "check":
      checkCertificate(args[0]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// Display help information
function showHelp() {
  console.log(`
CA Tool - Certificate Authority and Certificate Management

Usage:
  node ca-tool.js <command> [arguments]

Commands:
  create-ca <output-dir> [org-name]    Create a new Certificate Authority
  create-cert <ca-dir> <server-name> [days]   Create a server certificate (default validity: 730 days)
  list <ca-dir>                        List all certificates in the CA
  check <cert-file>                    Display information about a certificate

Examples:
  node ca-tool.js create-ca ./ca "My Organization"
  node ca-tool.js create-cert ./ca server1
  node ca-tool.js list ./ca
  node ca-tool.js check ./ca/servers/server1/server1.crt
  `);
}

// Run the main function
main();
