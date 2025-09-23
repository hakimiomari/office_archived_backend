'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">auth_nest_new_project documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                        <li class="link">
                            <a href="overview.html" data-type="chapter-link">
                                <span class="icon ion-ios-keypad"></span>Overview
                            </a>
                        </li>
                        <li class="link">
                            <a href="index.html" data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>README
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>
                    </ul>
                </li>
                    <li class="chapter modules">
                        <a data-type="chapter-link" href="modules.html">
                            <div class="menu-toggler linked" data-bs-toggle="collapse" ${ isNormalMode ?
                                'data-bs-target="#modules-links"' : 'data-bs-target="#xs-modules-links"' }>
                                <span class="icon ion-ios-archive"></span>
                                <span class="link-name">Modules</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                        </a>
                        <ul class="links collapse " ${ isNormalMode ? 'id="modules-links"' : 'id="xs-modules-links"' }>
                            <li class="link">
                                <a href="modules/AppModule.html" data-type="entity-link" >AppModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' : 'data-bs-target="#xs-controllers-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' :
                                            'id="xs-controllers-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' }>
                                            <li class="link">
                                                <a href="controllers/AppController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AppController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' : 'data-bs-target="#xs-injectables-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' :
                                        'id="xs-injectables-links-module-AppModule-76420a131981732852d16cad65e073e4281f6b16242a2409a020dd50a46bfc38166d49edcaa96a9cc73fd80934b94350db1302bb6f40638508f821331e22478a"' }>
                                        <li class="link">
                                            <a href="injectables/AppService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AppService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/PrismaService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PrismaService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/ArchivesModule.html" data-type="entity-link" >ArchivesModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' : 'data-bs-target="#xs-controllers-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' :
                                            'id="xs-controllers-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' }>
                                            <li class="link">
                                                <a href="controllers/ArchivesController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ArchivesController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' : 'data-bs-target="#xs-injectables-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' :
                                        'id="xs-injectables-links-module-ArchivesModule-37a304f786f39c7ee4a192de359aeda6ff66ed14ad0004edb70d077eee9135ca883aa76acc1a1186e0b4e4fe8c1b7584bbe5871280ee738ca1cbeaba812e6041"' }>
                                        <li class="link">
                                            <a href="injectables/ArchivesService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ArchivesService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/AuthModule.html" data-type="entity-link" >AuthModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' : 'data-bs-target="#xs-controllers-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' :
                                            'id="xs-controllers-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' }>
                                            <li class="link">
                                                <a href="controllers/AuthController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuthController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' : 'data-bs-target="#xs-injectables-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' :
                                        'id="xs-injectables-links-module-AuthModule-73fa9afb6e358ea281d1eede60a52efec53de04c5d4805f29b0832b2dafaa8644fca18e9758d67ae476d6509e5de3a595d6f85f78622920ccd2169a72dbfaaf9"' }>
                                        <li class="link">
                                            <a href="injectables/AuthService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AuthService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/SeedService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SeedService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/SignInProvider.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SignInProvider</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/PrismaModule.html" data-type="entity-link" >PrismaModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-PrismaModule-0a30996d1235bf2604a3c3e09c8f1199d43cb26cc3a3c409db2ea23ad71bf181806b1da96cfc90d204e717a917b83b7d35bd1c8bff82b9170de5064b4a322113"' : 'data-bs-target="#xs-injectables-links-module-PrismaModule-0a30996d1235bf2604a3c3e09c8f1199d43cb26cc3a3c409db2ea23ad71bf181806b1da96cfc90d204e717a917b83b7d35bd1c8bff82b9170de5064b4a322113"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-PrismaModule-0a30996d1235bf2604a3c3e09c8f1199d43cb26cc3a3c409db2ea23ad71bf181806b1da96cfc90d204e717a917b83b7d35bd1c8bff82b9170de5064b4a322113"' :
                                        'id="xs-injectables-links-module-PrismaModule-0a30996d1235bf2604a3c3e09c8f1199d43cb26cc3a3c409db2ea23ad71bf181806b1da96cfc90d204e717a917b83b7d35bd1c8bff82b9170de5064b4a322113"' }>
                                        <li class="link">
                                            <a href="injectables/PrismaService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PrismaService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/RedisModule.html" data-type="entity-link" >RedisModule</a>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-RedisModule-87496eaeb2b08b254cc0893a9762c52c9142bc51e1cf3536897fdf94aebb0a0800943bb1166c1e49cc8b6972d5eee80b7251619308cf7b7123753baec6bba25b"' : 'data-bs-target="#xs-injectables-links-module-RedisModule-87496eaeb2b08b254cc0893a9762c52c9142bc51e1cf3536897fdf94aebb0a0800943bb1166c1e49cc8b6972d5eee80b7251619308cf7b7123753baec6bba25b"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-RedisModule-87496eaeb2b08b254cc0893a9762c52c9142bc51e1cf3536897fdf94aebb0a0800943bb1166c1e49cc8b6972d5eee80b7251619308cf7b7123753baec6bba25b"' :
                                        'id="xs-injectables-links-module-RedisModule-87496eaeb2b08b254cc0893a9762c52c9142bc51e1cf3536897fdf94aebb0a0800943bb1166c1e49cc8b6972d5eee80b7251619308cf7b7123753baec6bba25b"' }>
                                        <li class="link">
                                            <a href="injectables/RedisService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RedisService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/UserModule.html" data-type="entity-link" >UserModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#controllers-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' : 'data-bs-target="#xs-controllers-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' }>
                                            <span class="icon ion-md-swap"></span>
                                            <span>Controllers</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="controllers-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' :
                                            'id="xs-controllers-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' }>
                                            <li class="link">
                                                <a href="controllers/UserController.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UserController</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' : 'data-bs-target="#xs-injectables-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' :
                                        'id="xs-injectables-links-module-UserModule-60865ed0c6c7f948f8f14e6671ddb82fb6ea156bb044445f08e72658edfaa9bd9f051e53bbd36b11e53717ae4e0eb973afa26a9ec9430ed4f861654a9def268d"' }>
                                        <li class="link">
                                            <a href="injectables/CreateUserProvider.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CreateUserProvider</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FindOneUserByEmailProvider.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FindOneUserByEmailProvider</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/UserService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UserService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#classes-links"' :
                            'data-bs-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/CreateUserDto.html" data-type="entity-link" >CreateUserDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/RoleDto.html" data-type="entity-link" >RoleDto</a>
                            </li>
                            <li class="link">
                                <a href="classes/SignInDto.html" data-type="entity-link" >SignInDto</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/BcryptProvider.html" data-type="entity-link" >BcryptProvider</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/HashingProvider.html" data-type="entity-link" >HashingProvider</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#guards-links"' :
                            'data-bs-target="#xs-guards-links"' }>
                            <span class="icon ion-ios-lock"></span>
                            <span>Guards</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="guards-links"' : 'id="xs-guards-links"' }>
                            <li class="link">
                                <a href="guards/AuthGuard.html" data-type="entity-link" >AuthGuard</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/Tokens.html" data-type="entity-link" >Tokens</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <a data-type="chapter-link" href="routes.html"><span class="icon ion-ios-git-branch"></span>Routes</a>
                        </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});