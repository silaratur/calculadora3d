-- Revisão de textos do Catálogo (nomes com erro, descrições de marketplace
-- com trechos de outros vendedores, categorias) e preços terminados em ,90.
-- Por SKU; o deploy faz backup do banco antes de migrar.

UPDATE "Product" SET "name" = 'Suporte para Celular Dobrável e Articulado', "description" = 'Suporte compacto que dobra e cabe no bolso. Aberto, apoia o celular na mesa para vídeos, chamadas, receitas e estudo.
• Dobrável e articulado, já vem pronto para usar
• Leve para levar na bolsa ou na mochila
• Impresso em PLA
Medidas fechado: 7,3 × 3,5 × 1,2 cm.' WHERE "sku" = 'A.001';
UPDATE "Product" SET "name" = 'Kit 12 Mini Capivaras Articuladas 2,7 cm', "description" = 'Doze mini capivaras com articulações que se mexem. Fazem sucesso como lembrancinha, brinde e coleção.
• 12 unidades de cerca de 2,7 cm
• Corpo articulado
• Para lembrancinhas, sacolinhas surpresa e decoração de mesa' WHERE "sku" = 'B.001';
UPDATE "Product" SET "name" = 'Kit Mini Pandas', "description" = 'Mini pandas em preto e branco, com cerca de 3 cm. Uma lembrancinha pequena e diferente para festa infantil, sacolinha surpresa ou mesa com tema panda.
• Cerca de 3 cm cada
• Leves e compactos
• Diga na conversa quantas unidades precisa para a festa' WHERE "sku" = 'B.002';
UPDATE "Product" SET "name" = 'Chaveiro Silaratur - Alto Relevo', "description" = 'Chaveiro com logo em alto relevo, feito para a Silaratur. É o exemplo do que fazemos para empresas: um brinde com a sua marca, que o cliente leva junto com a chave.
• Logo em alto relevo, em duas cores
• Leve, com argola para chaveiro
• Fazemos com a logo da sua empresa' WHERE "sku" = 'B.003';
UPDATE "Product" SET "name" = 'Chaveiro Estrela Articulado Sensorial', "description" = 'Chaveiro de estrelas encaixadas que giram e se mexem de forma independente. Bom para ocupar as mãos e aliviar a tensão, e ainda dá cor à chave, à mochila ou à bolsa.
• Articulado, já vem pronto, sem montagem
• Compacto e leve
• Ótimo como lembrancinha' WHERE "sku" = 'B.004';
UPDATE "Product" SET "name" = 'Chaveiro Sensorial Hexagonal', "description" = 'Chaveiro de hexágonos encaixados que se movem entre os dedos. Muito procurado por psicólogas como lembrancinha para pacientes.
• Leve e fácil de carregar
• Para brindes e lembrancinhas
Medidas: 3,7 × 3,2 × 0,8 cm.' WHERE "sku" = 'B.005';
UPDATE "Product" SET "name" = 'Kit Mini Jesus Sentado - 4 Unidades', "description" = 'Quatro mini Jesus sentados, com cerca de 5 cm de altura cada. Um detalhe de fé para monitor, mesa, prateleira, nicho ou painel do carro, e uma lembrancinha delicada para encontros de fé.
• 4 unidades de cerca de 5 cm
• Leves e fáceis de posicionar' WHERE "sku" = 'B.006';
UPDATE "Product" SET "name" = 'Cachorrinho Articulado', "description" = 'Cachorrinho articulado com textura que lembra pelo. Cada parte do corpo se mexe, o que faz dele um brinquedo de mesa gostoso de manusear.
• Corpo articulado com textura tátil
• Para quem ama cachorros, colecionadores e crianças' WHERE "sku" = 'B.007';
UPDATE "Product" SET "name" = 'Kit 15 Chaveiros Silaratur - Alto Relevo', "description" = 'Kit com 15 chaveiros com logo em alto relevo, feito para a Silaratur. É o formato que usamos para brindes de empresas: a sua marca na chave do cliente.
• 15 chaveiros com logo em alto relevo
• Fazemos com a logo da sua empresa, na quantidade que precisar' WHERE "sku" = 'B.008';
UPDATE "Product" SET "name" = 'Mini Jesus Sentado', "description" = 'Mini Jesus sentado, com cerca de 5 cm de altura. Um detalhe de fé para monitor, mesa de estudo, prateleira, nicho ou painel do carro.
• Cerca de 5 cm de altura
• Leve e fácil de posicionar
• Também em kit com 4 unidades' WHERE "sku" = 'B.009';
UPDATE "Product" SET "name" = 'Checklist Infantil de Tarefas', "description" = 'Quadro de tarefas para a rotina das crianças: cada item feito é marcado no próprio quadro. Ajuda a criar o hábito de escovar os dentes, arrumar a mochila e fazer a lição.
• Marcadores para cada tarefa do dia
• Tarefas trocáveis, para montar a rotina da sua casa
• Com corrente para pendurar na mochila ou na porta' WHERE "sku" = 'B.010';
UPDATE "Product" SET "name" = 'Chaveiro Dinossauro Articulado', "description" = 'Dinossauro articulado que se mexe suave nas mãos. Diversão para crianças e fãs de dinossauros, e um bom brinquedo antiestresse.
• Totalmente articulado, sem montagem
• Impresso em PLA
• Em várias cores' WHERE "sku" = 'B.011';
UPDATE "Product" SET "name" = 'Chaveiro Unicórnio Articulado', "description" = 'Unicórnio articulado que se movimenta de várias formas. Um brinquedo sensorial que acalma e diverte, para crianças e adultos.
• Corpo articulado
• Impresso em PLA
Medidas: 9 cm de altura e 11 cm de comprimento.' WHERE "sku" = 'B.012';
UPDATE "Product" SET "name" = 'Guia de Leitura Infantil', "description" = 'Régua com abertura central que mostra só a linha que está sendo lida. Ajuda a manter o foco e a não pular linhas, para crianças em alfabetização, estudantes e leitura longa.
• Abertura central para uma linha de texto
• Bordas arredondadas
• Leve, cabe no livro ou no estojo' WHERE "sku" = 'B.013';
UPDATE "Product" SET "name" = 'Bandeja Decorativa Oval Minimalista', "description" = 'Bandeja oval de linhas simples para organizar perfumes, velas, sabonetes, joias e pequenos objetos no lavabo, no banheiro, no quarto ou no escritório.
• Acabamento fosco
• Fácil de limpar
Medidas: 19 × 11 cm, 1,5 cm de altura.' WHERE "sku" = 'D.001';
UPDATE "Product" SET "name" = 'Placa Decorativa Feliz Natal Vermelha', "description" = 'Placa Feliz Natal com floco de neve, para mesa, aparador, estante ou perto da árvore. Um enfeite simples que já anuncia o Natal.
• Mensagem Feliz Natal com floco de neve
• Compacta, fácil de combinar com outros enfeites
• Também na cor branca' WHERE "sku" = 'D.002';
UPDATE "Product" SET "name" = 'Vasinho Mãozinhas de Coração', "description" = 'Vasinho com carinha e mãozinhas fazendo coração. Perfeito para suculentas e cactos pequenos, na mesa do escritório, na estante ou de presente.
• Para suculentas e cactos pequenos
• Vendido sem planta' WHERE "sku" = 'D.003';
UPDATE "Product" SET "name" = 'Kit Porta-Copos Canelado com Suporte', "description" = 'Seis porta-copos com borda ondulada e um suporte canelado com recorte lateral, para tirar os porta-copos sem derrubar os outros. Protege a mesa e fica bonito à vista.
• 6 porta-copos e 1 suporte
• Recorte lateral no suporte
• Para mesa de jantar, sala, escritório e bancada' WHERE "sku" = 'D.004';
UPDATE "Product" SET "name" = 'Porta-Joias Redondo com Esferas', "description" = 'Bandeja redonda com borda de esferas para anéis, brincos, colares, relógios e chaves. Fica bem na penteadeira, no criado-mudo ou no banheiro.
• 15 cm de diâmetro
• Acabamento texturizado' WHERE "sku" = 'D.005';
UPDATE "Product" SET "name" = 'Porta-Joias Oval Canelado', "description" = 'Bandeja fina e alongada com borda canelada, para anéis, brincos e acessórios do dia a dia. Cabe no criado-mudo ou no canto da cômoda.
• Formato oval estreito
• Borda com nervuras' WHERE "sku" = 'D.006';
UPDATE "Product" SET "name" = 'Saboneteira com Drenagem', "description" = 'Saboneteira com canaletas que escoam a água e mantêm o sabonete seco por mais tempo. Para banheiro, lavabo ou área de serviço.
• Sistema de drenagem
• Fácil de limpar
Medidas: 11,3 × 8,3 cm.' WHERE "sku" = 'D.007';
UPDATE "Product" SET "name" = 'Renas Natalinas Bege', "description" = 'Renas estilizadas, de linhas modernas, com 17,5 cm de altura. Ficam lindas em aparador, estante, mesa ou prateleira no Natal.
• Conjunto com 3 renas
• 17,5 cm de altura
• Também em vermelho e branco' WHERE "sku" = 'D.008';
UPDATE "Product" SET "name" = 'Jogo de Porta-Velas Escultural', "description" = 'Três porta-velas de formas orgânicas e textura canelada. Use juntos ou separados na mesa, no aparador ou na estante.
• Jogo com 3 porta-velas
• Outras cores sob consulta' WHERE "sku" = 'D.009';
UPDATE "Product" SET "name" = 'Renas Natalinas Vermelhas', "description" = 'Renas estilizadas, de linhas modernas, com 17,5 cm de altura. Ficam lindas em aparador, estante, mesa ou prateleira no Natal.
• Conjunto com 3 renas
• 17,5 cm de altura
• Também em bege e branco' WHERE "sku" = 'D.010';
UPDATE "Product" SET "name" = 'Quebra-Nozes Soldadinho Bege', "description" = 'Quebra-nozes de cerca de 20 cm em versão moderna e canelada. Um símbolo clássico do Natal para mesa, aparador, estante ou perto da árvore.
• Cerca de 20 cm de altura
• Leve e fácil de posicionar
• Combine cores diferentes para montar um conjunto' WHERE "sku" = 'D.011';
UPDATE "Product" SET "name" = 'Porta-Guardanapo Árvore de Natal', "description" = 'Porta-guardanapo em formato de árvore de Natal. Organiza os guardanapos e já decora a mesa da ceia.
• 15 × 15 cm
• Para guardanapos de papel ou de tecido
• Reutilizável, fácil de guardar depois das festas' WHERE "sku" = 'D.012';
UPDATE "Product" SET "name" = 'Tigelas Natalinas Árvore de Natal', "description" = 'Tigelas em formato de árvore de Natal para servir biscoitos, castanhas e petiscos na ceia ou nas festas de fim de ano.
• Design minimalista de árvore
• Empilháveis, ocupam pouco espaço
• Ficam lindas em vermelho e verde' WHERE "sku" = 'D.013';
UPDATE "Product" SET "name" = 'Presépio Minimalista Sagrada Família 12 cm', "description" = 'Presépio com José, Maria e o Menino Jesus sob a estrela de Belém, em traço minimalista. Para mesa, aparador, estante ou recepção.
• 12 cm
• Estrela de Belém no topo' WHERE "sku" = 'D.014';
UPDATE "Product" SET "name" = 'Túmulo Vazio Ele Vive - Jesus Ressuscitado', "description" = 'Escultura do túmulo vazio com a pedra "Ele vive", em design minimalista. Uma peça de paz e esperança para a Páscoa e para o ano todo.
• Em bege e branco
Medidas: 11 × 3,5 × 9 cm (comprimento × largura × altura).' WHERE "sku" = 'D.015';
UPDATE "Product" SET "name" = 'Renas Natalinas Brancas', "description" = 'Renas estilizadas, de linhas modernas, com 17,5 cm de altura. Ficam lindas em aparador, estante, mesa ou prateleira no Natal.
• Conjunto com 3 renas
• 17,5 cm de altura
• Também em bege e vermelho' WHERE "sku" = 'D.016';
UPDATE "Product" SET "name" = 'Placa Decorativa Feliz Natal Branca', "description" = 'Placa Feliz Natal com floco de neve, para mesa, aparador, estante ou perto da árvore. Um enfeite simples que já anuncia o Natal.
• Mensagem Feliz Natal com floco de neve
• Compacta, fácil de combinar com outros enfeites
• Também na cor vermelha' WHERE "sku" = 'D.017';
UPDATE "Product" SET "name" = 'Quebra-Nozes Soldadinho Canelado', "description" = 'Quebra-nozes de cerca de 20 cm em versão moderna e canelada. Um símbolo clássico do Natal para mesa, aparador, estante ou perto da árvore.
• Cerca de 20 cm de altura
• Leve e fácil de posicionar
• Combine cores diferentes para montar um conjunto' WHERE "sku" = 'D.018';
UPDATE "Product" SET "name" = 'Quebra-Nozes Soldadinho Vermelho', "description" = 'Quebra-nozes de cerca de 20 cm em versão moderna. Um símbolo clássico do Natal para mesa, aparador, estante ou perto da árvore.
• Cerca de 20 cm de altura
• Leve e fácil de posicionar
• Combine cores diferentes para montar um conjunto' WHERE "sku" = 'N.001';
UPDATE "Product" SET "name" = 'Chaveiro Porta-Anel', "description" = 'Potinho com tampa de rosca e argola de chaveiro para guardar aliança e anéis durante o treino. Prende na chave ou no zíper da mochila e não se perde.
• Tampa com rosca firme
• Argola para chaveiro' WHERE "sku" = 'U.001';

UPDATE "Product" SET "category" = 'Decoração de Natal' WHERE "category" = 'Decoração de natal';
UPDATE "Product" SET "category" = 'Utilidades' WHERE "category" = 'Utilidades ';

-- Preço de venda arredondado para cima até terminar em ,90 (mesma regra de
-- roundPriceTo90 em src/lib/costing.ts; o Catálogo passa a aplicar sozinho).
UPDATE "Product" SET "price" = ROUND(
  CAST("price" - 0.9 - 0.000001 AS INTEGER)
  + CASE WHEN ("price" - 0.9 - 0.000001) > CAST("price" - 0.9 - 0.000001 AS INTEGER) THEN 1 ELSE 0 END
  + 0.9, 2)
WHERE "price" > 0;
