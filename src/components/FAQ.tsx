import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, HelpCircle, DollarSign, Coins, CreditCard, RefreshCw, Download, AlertCircle } from "lucide-react";

interface FAQProps {
  onClose: () => void;
}

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags?: string[];
}

const faqData: FAQItem[] = [
  // TOKEN GENERATION
  {
    id: "token-types",
    category: "Token Generation",
    question: "What are the different types of tokens I can generate?",
    answer: `There are two main types of tokens:

**Product Tokens:**
- Linked to specific products in the system
- Can be funded with USD or Credits
- Credits are calculated based on the product's value_credits_usd ratio
- Each product has its own credit-to-USD conversion rate
- Used for specific services or APIs

**Master Tokens:**
- Universal tokens not linked to specific products
- Always funded in USD (1 USD = 1 Credit)
- More flexible and can be used across different services
- Higher level of access and functionality`,
    tags: ["tokens", "product", "master"]
  },
  {
    id: "token-generation-cost",
    category: "Token Generation",
    question: "How is the cost calculated for token generation?",
    answer: `Token generation cost includes:

**Base Cost:**
- For Product Tokens: Depends on USD amount or credits × product rate
- For Master Tokens: Direct USD amount (1 USD = 1 Credit)

**Fixed Fee:**
- $0.0001 per generation request (regardless of token quantity)

**Total Formula:**
- Total Cost = (Token Value × Quantity) + $0.0001 fee

**Examples:**
- 5 Product Tokens at $10 each = (5 × $10) + $0.0001 = $50.0001
- 3 Master Tokens at $25 each = (3 × $25) + $0.0001 = $75.0001`,
    tags: ["cost", "fee", "calculation"]
  },
  {
    id: "token-prefix",
    category: "Token Generation",
    question: "How do token prefixes work?",
    answer: `Token prefixes help organize and identify your tokens:

**Auto Generate (Default):**
- System generates a random 4-character prefix
- Format: PREFIX-CREDITS-RANDOMSTRING (Product Tokens)
- Format: PREFIX-VALUEUSD-RANDOMSTRING (Master Tokens)

**Custom Prefix:**
- You can set your own prefix (max 4 characters)
- Must be alphanumeric (A-Z, a-z, 0-9)
- Helps with token organization and identification

**Examples:**
- Product Token: ABCD-1000-X1Y2Z3W4V5U6T7S
- Master Token: SALE-50USD-A1B2C3D4E5F6G7H`,
    tags: ["prefix", "organization", "naming"]
  },
  {
    id: "batch-generation",
    category: "Token Generation",
    question: "Can I generate multiple tokens at once?",
    answer: `Yes! You can generate 1-1000 tokens in a single batch:

**Batch Benefits:**
- Single transaction fee ($0.0001) for entire batch
- All tokens have the same configuration
- Easier to manage and export
- Cost-effective for bulk token creation

**Batch Limitations:**
- All tokens in a batch must be the same type
- Same credit/USD value for all tokens
- Same product (if Product Tokens)
- Cannot mix different configurations

**Export Options:**
- Download all tokens as .txt file
- Export specific batches separately
- Tokens listed one per line for easy integration`,
    tags: ["batch", "bulk", "multiple", "export"]
  },

  // REFILL SYSTEM
  {
    id: "refill-tokens",
    category: "Token Refill",
    question: "How does the token refill system work?",
    answer: `Token refilling allows you to add more credits to existing tokens:

**For Product Tokens:**
- **USD Mode**: Spend USD to add credits (credits = USD / product_rate)
- **Credits Mode**: Specify exact credits to add (cost = credits × product_rate)
- Must match the product's conversion rate

**For Master Tokens:**
- **Only USD Mode**: 1 USD = 1000 credits
- Direct 1:1 ratio for credits to USD
- No credits mode available

**Refill Process:**
1. Search for your token by partial string
2. Select the token from search results
3. Choose refill mode (USD/Credits)
4. Enter amount to add
5. Confirm and pay from your balance`,
    tags: ["refill", "credits", "usd", "add"]
  },
  {
    id: "refill-cost-calculation",
    category: "Token Refill",
    question: "How are refill costs calculated?",
    answer: `Refill costs depend on token type and mode:

**Product Tokens:**
- USD Mode: Total Cost = USD Amount (includes fee)
  Credits Added = (USD - $0.0001 fee) / product_rate
- Credits Mode: Total Cost = (Credits × product_rate) + $0.0001 fee

**Master Tokens:**
- USD Mode Only: Total Cost = USD Amount + $0.0001 fee
  Credits Added = (USD - fee) × 1000

**Fee Structure:**
- Fixed fee: $0.0001 per refill operation
- Fee is always added to your input amount
- Minimum amounts ensure at least 1 credit is added

**Example (Product with $0.01/credit rate):**
- Refill $10 USD: Cost = $10, Credits = ($10 - $0.0001) / $0.01 = 999 credits
- Refill 500 credits: Cost = (500 × $0.01) + $0.0001 = $5.0001`,
    tags: ["refill", "cost", "calculation", "fee"]
  },

  // PAYMENT SYSTEM
  {
    id: "payment-methods",
    category: "Payments",
    question: "What payment methods are supported?",
    answer: `The platform uses NowPayments for cryptocurrency payments:

**Supported Cryptocurrencies:**
- Bitcoin (BTC)
- Ethereum (ETH)
- Litecoin (LTC)
- Many other popular cryptocurrencies

**Payment Process:**
1. Enter USD amount (minimum $1.00)
2. Create invoice through NowPayments
3. Choose your preferred cryptocurrency
4. Complete payment within the time limit
5. Funds are automatically credited after confirmation

**Payment Status Tracking:**
- Pending: Payment initiated but not confirmed
- Confirmed/Finished/Paid: Payment successful
- Failed/Cancelled: Payment unsuccessful

**Real-time Updates:**
- Dashboard shows live payment status
- Automatic balance updates when payments confirm`,
    tags: ["payment", "crypto", "nowpayments", "bitcoin"]
  },
  {
    id: "payment-balance",
    category: "Payments",
    question: "How does the balance system work?",
    answer: `Your account balance is calculated in real-time:

**Balance Calculation:**
- Total Deposited = Sum of all confirmed payments
- Total Spent = Sum of all token generation and refill costs
- Available Balance = Deposited - Spent (minimum $0)

**Balance Usage:**
- Used for token generation
- Used for token refills
- Deducted immediately upon successful operations
- Cannot go below zero

**Balance Protection:**
- All operations check sufficient balance first
- Transactions fail if insufficient funds
- No overdraft or negative balance allowed

**Dashboard Display:**
- Real-time balance updates
- Detailed breakdown of deposits and spending
- Transaction history with timestamps`,
    tags: ["balance", "funds", "calculation", "deposit"]
  },

  // TECHNICAL DETAILS
  {
    id: "database-schema",
    category: "Technical",
    question: "How is my data stored and organized?",
    answer: `The system uses a secure Supabase database with the following structure:

**Main Tables:**
- **tokens**: Individual token records with credits and metadata
- **transactions**: Token generation history and batch information
- **refill_transactions**: Token refill operations history
- **payment_history**: All payment records and status updates
- **products**: Available products and their credit rates
- **profiles**: User account information

**Data Security:**
- Row Level Security (RLS) ensures you only see your data
- All operations are user-scoped and authenticated
- Secure API endpoints with proper validation

**External Integration:**
- Tokens are synchronized to HUB API for service access
- Master tokens go to tokens_master table
- Product tokens go to tokens table with product info`,
    tags: ["database", "security", "structure", "data"]
  },
  {
    id: "api-integration",
    category: "Technical",
    question: "How do tokens integrate with external services?",
    answer: `Tokens are automatically synchronized with external HUB API:

**Product Tokens:**
- Sent to 'tokens' table in HUB API
- Include: token string, product_id, credits, product name
- Used for service-specific API access

**Master Tokens:**
- Sent to 'tokens_master' table in HUB API
- Include: token string, credits, master designation
- Provide universal API access

**Synchronization:**
- Automatic sync during token generation
- Real-time updates during refill operations
- Error handling if sync fails (local tokens still work)

**Service Access:**
- Tokens are used as authentication for API calls
- Credits are deducted based on service usage
- Real-time credit tracking and updates`,
    tags: ["api", "integration", "hub", "sync"]
  },

  // TROUBLESHOOTING
  {
    id: "common-errors",
    category: "Troubleshooting",
    question: "What are common errors and how to fix them?",
    answer: `Common issues and solutions:

**"Insufficient Balance":**
- Add funds to your account through the payments tab
- Wait for payment confirmation (can take 10-60 minutes)
- Check payment status in payments history

**"Product Not Found":**
- Refresh the page to update product list
- Contact support if products don't load
- Verify product is still available

**"Token Not Found" (during refill):**
- Check token string spelling and case
- Ensure you own the token (user-scoped)
- Try searching with partial token string

**"Amount Too Small":**
- Ensure minimum amounts are met
- Account for $0.0001 processing fee
- For master tokens, use whole USD amounts only

**Payment Issues:**
- Check cryptocurrency network fees and confirmations
- Verify payment was sent to correct address
- Contact support with payment transaction hash`,
    tags: ["errors", "troubleshooting", "fixes", "support"]
  },
  {
    id: "best-practices",
    category: "Best Practices",
    question: "What are the best practices for using the platform?",
    answer: `Recommended practices for optimal experience:

**Token Management:**
- Use descriptive custom prefixes for organization
- Generate tokens in batches for cost efficiency
- Export and backup token lists regularly
- Keep track of token purposes and usage

**Financial Management:**
- Monitor your balance regularly
- Plan token generation based on your needs
- Consider batch operations to save on fees
- Keep payment confirmation emails/transaction hashes

**Security:**
- Keep your tokens secure and private
- Don't share tokens with unauthorized users
- Log out from shared computers
- Monitor your account activity regularly

**Efficiency Tips:**
- Use product-specific tokens for better cost control
- Master tokens for flexible, multi-service access
- Refill existing tokens rather than generating new ones when possible
- Export tokens immediately after generation`,
    tags: ["practices", "tips", "security", "efficiency"]
  }
];

const categories = Array.from(new Set(faqData.map(item => item.category)));

const FAQ: React.FC<FAQProps> = ({ onClose }) => {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };

  const filteredFAQ = faqData.filter(item => {
    const categoryMatch = selectedCategory === "All" || item.category === selectedCategory;
    const searchMatch = searchQuery === "" || 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    return categoryMatch && searchMatch;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Token Generation": return <Coins className="w-4 h-4" />;
      case "Token Refill": return <RefreshCw className="w-4 h-4" />;
      case "Payments": return <CreditCard className="w-4 h-4" />;
      case "Technical": return <HelpCircle className="w-4 h-4" />;
      case "Troubleshooting": return <AlertCircle className="w-4 h-4" />;
      case "Best Practices": return <DollarSign className="w-4 h-4" />;
      default: return <HelpCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                Frequently Asked Questions
              </CardTitle>
              <CardDescription>
                Complete guide to using the Token Hub platform
              </CardDescription>
            </div>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
          
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search FAQ..."
                className="w-full px-4 py-2 border rounded-lg pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <HelpCircle className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            </div>
            
            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === "All" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("All")}
              >
                All ({faqData.length})
              </Button>
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="flex items-center gap-1"
                >
                  {getCategoryIcon(category)}
                  {category} ({faqData.filter(item => item.category === category).length})
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        
        <Separator />
        
        <CardContent className="flex-1 overflow-y-auto space-y-4 p-6">
          {filteredFAQ.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No FAQ items match your search criteria.</p>
              <p className="text-sm">Try adjusting your search or category filter.</p>
            </div>
          ) : (
            filteredFAQ.map((item) => (
              <Card key={item.id} className="border">
                <Collapsible
                  open={openItems.has(item.id)}
                  onOpenChange={() => toggleItem(item.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {item.category}
                            </Badge>
                            {item.tags && item.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <CardTitle className="text-base font-medium">
                            {item.question}
                          </CardTitle>
                        </div>
                        {openItems.has(item.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {item.answer}
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FAQ;